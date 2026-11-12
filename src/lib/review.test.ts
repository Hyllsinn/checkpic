import { describe, expect, it, vi } from "vitest";
import {
  parseQueue,
  parseStats,
  percent,
  reviewApi,
  speciesLabel,
  triageReasonLabel,
} from "./review";

const item = {
  id: "0f8b5a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
  created_at: "2026-11-12T10:00:00Z",
  storage_path: "0f8b5a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.jpg",
  species_chosen: "squalius_cephalus",
  model_version: "small-20261112",
  model_suggestions: [{ speciesId: "rutilus_rutilus", score: 0.62 }],
  model_uncertain: true,
  caught_on: "2026-11-03",
  river_label: "La Charente",
  triage: "doubt",
  triage_reasons: ["disagreement"],
};

describe("lecture de la file", () => {
  it("garde une photo valide et ses informations", () => {
    const q = parseQueue({
      species: [{ id: "rutilus_rutilus", label: "Gardon" }],
      pending: 3,
      items: [item],
    });
    expect(q.pending).toBe(3);
    expect(q.items[0]).toMatchObject({
      speciesChosen: "squalius_cephalus",
      suggestions: [{ speciesId: "rutilus_rutilus", score: 0.62 }],
      triage: "doubt",
      riverLabel: "La Charente",
    });
  });

  it("écarte les données inattendues au lieu de les afficher", () => {
    const q = parseQueue({
      species: [{ id: "<script>", label: "x" }],
      pending: -4,
      items: [
        { ...item, storage_path: "../secret.jpg" },
        { ...item, triage: "peut-être" },
        { ...item, model_suggestions: [{ speciesId: "rutilus_rutilus", score: 7 }] },
      ],
    });
    expect(q.species).toEqual([]);
    expect(q.pending).toBe(0);
    expect(q.items).toHaveLength(1);
    expect(q.items[0]!.suggestions).toEqual([]);
    expect(() => parseQueue(null)).toThrow("queue_invalid");
    expect(parseStats({ pending: 2, pending_doubt: 1, validated: "x" })).toEqual({
      pending: 2,
      pendingDoubt: 1,
      validated: 0,
      rejected: 0,
    });
  });

  it("libellés lisibles", () => {
    expect(speciesLabel([{ id: "esox_lucius", label: "Brochet" }], "esox_lucius")).toBe("Brochet");
    expect(speciesLabel([], "esox_lucius")).toBe("esox lucius");
    expect(percent(0.623)).toBe("62 %");
    expect(triageReasonLabel("disagreement")).toContain("pas d’accord");
    expect(triageReasonLabel("inconnu")).toBe("Autre raison de vérification");
  });
});

describe("décisions envoyées au serveur", () => {
  function fakeClient() {
    const remove = vi.fn(async () => ({ data: [], error: null }));
    const rpc = vi.fn(async () => ({ data: { id: item.id }, error: null }));
    const client = {
      rpc,
      storage: { from: vi.fn(() => ({ remove, createSignedUrl: vi.fn() })) },
    };
    return { client, rpc, remove };
  }
  it("valider envoie l'espèce choisie", async () => {
    const { client, rpc, remove } = fakeClient();
    await reviewApi(client as never).validate(item.id, "esox_lucius");
    expect(rpc).toHaveBeenCalledWith("riversense_photo_review_v1", {
      p_id: item.id,
      p_decision: "validate",
      p_species: "esox_lucius",
      p_reason: null,
    });
    expect(remove).not.toHaveBeenCalled();
  });
  it("rejeter enregistre la raison puis supprime la photo", async () => {
    const { client, rpc, remove } = fakeClient();
    const parsed = parseQueue({ species: [], pending: 1, items: [item] }).items[0]!;
    await reviewApi(client as never).reject(parsed, "not_fish");
    expect(rpc).toHaveBeenCalledWith("riversense_photo_review_v1", {
      p_id: item.id,
      p_decision: "reject",
      p_species: null,
      p_reason: "not_fish",
    });
    expect(remove).toHaveBeenCalledWith([item.storage_path]);
  });
  it("un refus du serveur devient « forbidden » et ne supprime rien", async () => {
    const { client, remove } = fakeClient();
    client.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } } as never);
    const parsed = parseQueue({ species: [], pending: 1, items: [item] }).items[0]!;
    await expect(reviewApi(client as never).reject(parsed, "other")).rejects.toThrow("forbidden");
    expect(remove).not.toHaveBeenCalled();
  });
});
