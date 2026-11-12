import { useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { Login } from "./components/Login";
import { Review } from "./components/Review";
import { reviewApi } from "./lib/review";

type Access = "loading" | "signed_out" | "checking" | "admin" | "denied" | "error";

/** Connexion obligatoire, puis rôle administrateur vérifié par le serveur. Aucune photo ni
 * donnée n'est demandée avant que le serveur ait confirmé le rôle. */
export function App({ client }: { client: SupabaseClient }) {
  const api = useMemo(() => reviewApi(client), [client]);
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<Access>("loading");

  useEffect(() => {
    let alive = true;
    void client.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (!data.session) setAccess("signed_out");
    });
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setAccess("signed_out");
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setAccess("checking");
    api
      .isAdmin()
      .then((ok) => alive && setAccess(ok ? "admin" : "denied"))
      .catch(() => alive && setAccess("error"));
    return () => {
      alive = false;
    };
  }, [api, userId]);

  const signOut = () => void client.auth.signOut();

  if (access === "signed_out") return <Login client={client} />;
  if (access === "admin") return <Review api={api} onSignOut={signOut} />;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <div className="panel p-6 text-center">
        <h1 className="text-2xl font-bold">CheckPic</h1>
        {access === "denied" ? (
          <>
            <p className="mt-3 text-sm" role="alert">
              Accès refusé : ce compte n’est pas administrateur.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Compte : {session?.user.email}</p>
          </>
        ) : access === "error" ? (
          <p className="mt-3 text-sm" role="alert">
            Vérification impossible. Vérifiez votre réseau, puis rechargez la page.
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Vérification de l’accès…</p>
        )}
        {session && (
          <button type="button" onClick={signOut} className="mt-5 text-sm underline">
            Se déconnecter
          </button>
        )}
      </div>
    </main>
  );
}
