import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Même projet Supabase que River'Sense. Adresse et clé publique (publishable) : sans
 * danger dans le navigateur ; toute la sécurité repose sur la connexion, le rôle
 * administrateur et les règles d'accès côté serveur. Jamais de clé secrète ici. */
export const SUPABASE_URL =
  (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ??
  "https://jvqgetvuoepeucvcnwse.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) ??
  "sb_publishable_eHwrBstcdkgXiU9_xkYwrA_A1OSz_uc";

let client: SupabaseClient | undefined;
export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "checkpic-auth" },
  });
  return client;
}
