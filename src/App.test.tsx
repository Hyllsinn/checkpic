import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";

const queueData = {
  species: [
    { id: "squalius_cephalus", label: "Chevesne" },
    { id: "rutilus_rutilus", label: "Gardon" },
  ],
  pending: 1,
  items: [
    {
      id: "0f8b5a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
      storage_path: "0f8b5a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.jpg",
      species_chosen: "squalius_cephalus",
      model_suggestions: [{ speciesId: "rutilus_rutilus", score: 0.62 }],
      triage: "doubt",
      triage_reasons: ["disagreement"],
    },
  ],
};

function client({ session, admin }: { session: boolean; admin: boolean }) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "riversense_photo_is_admin_v1") return { data: admin, error: null };
    if (!admin) return { data: null, error: { code: "42501" } };
    if (name === "riversense_photo_review_stats_v1")
      return { data: { pending: 1, pending_doubt: 1, validated: 0, rejected: 0 }, error: null };
    if (name === "riversense_photo_review_queue_v1") return { data: queueData, error: null };
    return { data: { status: "validated" }, error: null };
  });
  const createSignedUrl = vi.fn(async () => ({
    data: { signedUrl: "https://x.invalid/p.jpg" },
    error: null,
  }));
  return {
    rpc,
    createSignedUrl,
    value: {
      rpc,
      storage: { from: () => ({ createSignedUrl, remove: vi.fn(async () => ({ error: null })) }) },
      auth: {
        getSession: async () => ({
          data: { session: session ? { user: { id: "u1", email: "moi@exemple.fr" } } : null },
        }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: vi.fn(),
        signInWithPassword: vi.fn(async () => ({ error: null })),
        signUp: vi.fn(),
      },
    },
  };
}

let unmount = async () => {};
afterEach(async () => unmount());
async function render(c: ReturnType<typeof client>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  unmount = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  await act(async () => root.render(<App client={c.value as never} />));
  return container;
}

it("sans connexion : seulement l'écran de connexion, aucune donnée demandée", async () => {
  const c = client({ session: false, admin: false });
  const container = await render(c);
  await vi.waitFor(() => expect(container.textContent).toContain("Se connecter"));
  expect(c.rpc).not.toHaveBeenCalled();
});

it("compte connecté mais pas administrateur : accès refusé, aucune photo demandée", async () => {
  const c = client({ session: true, admin: false });
  const container = await render(c);
  await vi.waitFor(() => expect(container.textContent).toContain("Accès refusé"));
  expect(c.rpc).toHaveBeenCalledTimes(1);
  expect(c.createSignedUrl).not.toHaveBeenCalled();
});

it("administrateur : compteurs, puis la photo et sa validation en un appui", async () => {
  const c = client({ session: true, admin: true });
  const container = await render(c);
  await vi.waitFor(() => expect(container.textContent).toContain("Commencer"));
  const button = (text: string) =>
    [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;
  await act(async () => button("Commencer").click());
  await vi.waitFor(() => expect(container.querySelector("img")).not.toBeNull());
  expect(container.textContent).toContain("Chevesne");
  expect(container.textContent).toContain("Gardon 62 %");
  expect(container.textContent).toContain("pas d’accord");
  await act(async () => button("Le pêcheur a raison").click());
  await vi.waitFor(() => expect(container.textContent).toContain("C’est terminé"));
  expect(c.rpc).toHaveBeenCalledWith("riversense_photo_review_v1", {
    p_id: queueData.items[0]!.id,
    p_decision: "validate",
    p_species: "squalius_cephalus",
    p_reason: null,
  });
});
