import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Connexion (ou création du compte, une seule fois) par adresse e-mail et mot de passe. */
export function Login({ client }: { client: SupabaseClient }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (mode === "signin") {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) setMessage("Adresse ou mot de passe incorrect.");
      } else {
        if (password.length < 10) {
          setMessage("Choisissez un mot de passe d’au moins 10 caractères.");
          return;
        }
        const { data, error } = await client.auth.signUp({ email, password });
        if (error) setMessage("Création du compte impossible. Réessayez plus tard.");
        else if (!data.session)
          setMessage(
            "Compte créé. Ouvrez l’e-mail de confirmation reçu, puis revenez ici pour vous connecter.",
          );
      }
    } catch {
      setMessage("Connexion impossible. Vérifiez votre réseau.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="panel p-6">
        <p className="text-sm font-medium text-primary">River’Sense</p>
        <h1 className="mt-1 text-3xl font-bold">CheckPic</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Vérification des photos de poissons avant l’entraînement du modèle. Accès réservé.
        </p>
        <form className="mt-6 flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
          <label className="flex flex-col gap-1 text-sm">
            Adresse e-mail
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border bg-secondary px-3 py-2 text-base text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Mot de passe
            <input
              type="password"
              required
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border bg-secondary px-3 py-2 text-base text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground"
          >
            {busy ? "Patientez…" : mode === "signin" ? "Se connecter" : "Créer mon compte"}
          </button>
        </form>
        {message && (
          <p role="status" className="mt-4 text-sm text-accent">
            {message}
          </p>
        )}
        <button
          type="button"
          className="mt-6 text-sm text-muted-foreground underline"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setMessage("");
          }}
        >
          {mode === "signin" ? "Première visite ? Créer mon compte" : "J’ai déjà un compte"}
        </button>
      </div>
    </main>
  );
}
