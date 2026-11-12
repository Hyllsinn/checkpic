import type { SupabaseClient } from "@supabase/supabase-js";

/** Accès à la file de vérification (fonctions SQL réservées aux administrateurs connectés,
 * voir la migration `photo_review_foundation` du dépôt River'Sense). Toute réponse est
 * revalidée ici : une donnée inattendue n'est jamais affichée telle quelle. */

export const PHOTO_BUCKET = "riversense-photos";

export type Species = { id: string; label: string };
export type Suggestion = { speciesId: string; score: number };
export type ReviewItem = {
  id: string;
  createdAt: string;
  storagePath: string;
  speciesChosen: string;
  modelVersion: string | null;
  suggestions: Suggestion[];
  modelUncertain: boolean | null;
  caughtOn: string | null;
  riverLabel: string | null;
  triage: "accept" | "doubt" | "reject";
  triageReasons: string[];
};
export type Queue = { species: Species[]; pending: number; items: ReviewItem[] };
export type Stats = { pending: number; pendingDoubt: number; validated: number; rejected: number };
export type RejectReason = "not_fish" | "poor_quality" | "malicious" | "duplicate" | "other";

export const REJECT_REASONS: { id: RejectReason; label: string }[] = [
  { id: "not_fish", label: "Pas un poisson" },
  { id: "poor_quality", label: "Photo ratée (floue, sombre, coupée)" },
  { id: "duplicate", label: "Photo en double" },
  { id: "malicious", label: "Envoi malveillant" },
  { id: "other", label: "Autre raison" },
];

const TRIAGE_REASONS: Record<string, string> = {
  disagreement: "Le pêcheur et le modèle ne sont pas d’accord",
  low_confidence: "Le modèle hésitait",
  new_device: "Nouveau pêcheur",
  unlikely_species: "Espèce rare à cet endroit",
  not_in_model: "Espèce que le modèle ne connaît pas encore",
  sampled: "Contrôle au hasard",
};
export function triageReasonLabel(reason: string): string {
  return TRIAGE_REASONS[reason] ?? "Autre raison de vérification";
}

const ID = /^[a-z][a-z0-9_]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 200): string | null =>
  typeof v === "string" && v.length <= max ? v : null;
const count = (v: unknown): number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;

function parseItem(raw: unknown): ReviewItem | null {
  if (!isObject(raw)) return null;
  const id = str(raw["id"]);
  const path = str(raw["storage_path"]);
  const chosen = str(raw["species_chosen"]);
  const triage = raw["triage"];
  if (!id || !UUID.test(id) || !path || !/^[0-9a-f-]{36}\.jpg$/.test(path)) return null;
  if (!chosen || !ID.test(chosen)) return null;
  if (triage !== "accept" && triage !== "doubt" && triage !== "reject") return null;
  const suggestions = Array.isArray(raw["model_suggestions"])
    ? raw["model_suggestions"].flatMap((s): Suggestion[] => {
        if (!isObject(s)) return [];
        const speciesId = str(s["speciesId"]);
        const score = s["score"];
        return speciesId &&
          ID.test(speciesId) &&
          typeof score === "number" &&
          score >= 0 &&
          score <= 1
          ? [{ speciesId, score }]
          : [];
      })
    : [];
  const reasons = Array.isArray(raw["triage_reasons"])
    ? raw["triage_reasons"].filter((r): r is string => typeof r === "string" && r.length <= 64)
    : [];
  const uncertain = raw["model_uncertain"];
  return {
    id,
    createdAt: str(raw["created_at"]) ?? "",
    storagePath: path,
    speciesChosen: chosen,
    modelVersion: str(raw["model_version"], 40),
    suggestions: suggestions.slice(0, 3),
    modelUncertain: typeof uncertain === "boolean" ? uncertain : null,
    caughtOn: str(raw["caught_on"], 10),
    riverLabel: str(raw["river_label"], 120),
    triage,
    triageReasons: reasons,
  };
}

export function parseQueue(raw: unknown): Queue {
  if (!isObject(raw)) throw Error("queue_invalid");
  const species = Array.isArray(raw["species"])
    ? raw["species"].flatMap((s): Species[] => {
        if (!isObject(s)) return [];
        const id = str(s["id"]);
        const label = str(s["label"], 120);
        return id && ID.test(id) && label ? [{ id, label }] : [];
      })
    : [];
  const items = Array.isArray(raw["items"])
    ? raw["items"].flatMap((i) => {
        const item = parseItem(i);
        return item ? [item] : [];
      })
    : [];
  return { species, pending: count(raw["pending"]), items };
}

export function parseStats(raw: unknown): Stats {
  if (!isObject(raw)) throw Error("stats_invalid");
  return {
    pending: count(raw["pending"]),
    pendingDoubt: count(raw["pending_doubt"]),
    validated: count(raw["validated"]),
    rejected: count(raw["rejected"]),
  };
}

export function speciesLabel(species: Species[], id: string): string {
  return species.find((s) => s.id === id)?.label ?? id.replace(/_/g, " ");
}

export function percent(score: number): string {
  return `${Math.round(score * 100)} %`;
}

/** Fonctions d'accès, construites sur un client Supabase (remplaçable dans les tests). */
export function reviewApi(client: SupabaseClient) {
  async function rpc(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw Error(error.code === "42501" ? "forbidden" : "server_error");
    return data;
  }
  return {
    async isAdmin(): Promise<boolean> {
      return (await rpc("riversense_photo_is_admin_v1")) === true;
    },
    async stats(): Promise<Stats> {
      return parseStats(await rpc("riversense_photo_review_stats_v1"));
    },
    async queue(limit = 20): Promise<Queue> {
      return parseQueue(await rpc("riversense_photo_review_queue_v1", { p_limit: limit }));
    },
    /** Adresse temporaire (5 minutes) de la photo, lisible seulement par un administrateur. */
    async photoUrl(path: string): Promise<string> {
      const { data, error } = await client.storage.from(PHOTO_BUCKET).createSignedUrl(path, 300);
      if (error || !data?.signedUrl) throw Error("photo_unavailable");
      return data.signedUrl;
    },
    async validate(id: string, species: string): Promise<void> {
      await rpc("riversense_photo_review_v1", {
        p_id: id,
        p_decision: "validate",
        p_species: species,
        p_reason: null,
      });
    },
    /** Rejet : la décision est enregistrée, puis la photo est supprimée du dossier. */
    async reject(item: ReviewItem, reason: RejectReason): Promise<void> {
      await rpc("riversense_photo_review_v1", {
        p_id: item.id,
        p_decision: "reject",
        p_species: null,
        p_reason: reason,
      });
      await client.storage.from(PHOTO_BUCKET).remove([item.storagePath]);
    },
  };
}
export type ReviewApi = ReturnType<typeof reviewApi>;
