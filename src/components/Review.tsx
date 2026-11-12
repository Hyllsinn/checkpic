import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  percent,
  REJECT_REASONS,
  speciesLabel,
  triageReasonLabel,
  type Queue,
  type RejectReason,
  type ReviewApi,
  type ReviewItem,
  type Stats,
} from "../lib/review";

type Panel = "main" | "species" | "reject";

/** Accueil (compteurs) puis vérification une photo à la fois. */
export function Review({ api, onSignOut }: { api: ReviewApi; onSignOut: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const skipped = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [s, q] = await Promise.all([api.stats(), api.queue(20)]);
      setStats(s);
      setQueue(q);
    } catch {
      setError("Chargement impossible. Vérifiez votre réseau, puis réessayez.");
    }
  }, [api]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remaining = queue?.items.filter((i) => !skipped.current.has(i.id)) ?? [];
  const current = remaining[0];

  function done(id: string, decision: "validated" | "rejected") {
    setQueue((q) =>
      q
        ? { ...q, pending: Math.max(0, q.pending - 1), items: q.items.filter((i) => i.id !== id) }
        : q,
    );
    setStats((s) =>
      s
        ? {
            ...s,
            pending: Math.max(0, s.pending - 1),
            validated: s.validated + (decision === "validated" ? 1 : 0),
            rejected: s.rejected + (decision === "rejected" ? 1 : 0),
          }
        : s,
    );
  }
  useEffect(() => {
    // File locale épuisée : on recharge la suite (les photos passées restent de côté).
    if (started && queue && remaining.length === 0 && queue.pending > queue.items.length)
      void refresh();
  }, [started, queue, remaining.length, refresh]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 py-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-primary">River’Sense</p>
          <h1 className="text-2xl font-bold">CheckPic</h1>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="text-sm text-muted-foreground underline"
        >
          Se déconnecter
        </button>
      </header>

      {error && (
        <div className="panel mt-6 p-4 text-sm">
          <p role="alert">{error}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-3 rounded-lg bg-secondary px-4 py-2"
          >
            Réessayer
          </button>
        </div>
      )}

      {!started && stats && (
        <section className="panel mt-6 p-5">
          <h2 className="text-lg font-semibold">Photos à vérifier</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-center">
            <Counter label="En attente" value={stats.pending} highlight />
            <Counter label="Dont « doute »" value={stats.pendingDoubt} />
            <Counter label="Validées" value={stats.validated} />
            <Counter label="Rejetées" value={stats.rejected} />
          </dl>
          {stats.pending > 0 ? (
            <button
              type="button"
              onClick={() => setStarted(true)}
              className="mt-5 w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground"
            >
              Commencer
            </button>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              Aucune photo à vérifier pour l’instant. Les photos corrigées par les pêcheurs qui ont
              donné leur accord apparaîtront ici.
            </p>
          )}
        </section>
      )}

      {started && queue && current && (
        <PhotoCard
          key={current.id}
          api={api}
          item={current}
          queue={queue}
          left={Math.max(stats?.pending ?? 0, remaining.length)}
          onDone={done}
          onSkip={() => {
            skipped.current.add(current.id);
            setQueue((q) => (q ? { ...q } : q));
          }}
        />
      )}

      {started && queue && !current && (
        <section className="panel mt-6 p-5 text-center">
          <h2 className="text-lg font-semibold">C’est terminé pour l’instant</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {skipped.current.size > 0
              ? `${skipped.current.size} photo(s) passée(s) reviendront à votre prochaine visite.`
              : "Merci ! Toutes les photos en attente ont été vérifiées."}
          </p>
          <button
            type="button"
            onClick={() => {
              skipped.current.clear();
              setStarted(false);
              void refresh();
            }}
            className="mt-4 rounded-lg bg-secondary px-4 py-2"
          >
            Retour à l’accueil
          </button>
        </section>
      )}
    </main>
  );
}

function Counter({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-secondary/60 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-2xl font-bold ${highlight ? "text-primary" : ""}`}>{value}</dd>
    </div>
  );
}

function PhotoCard({
  api,
  item,
  queue,
  left,
  onDone,
  onSkip,
}: {
  api: ReviewApi;
  item: ReviewItem;
  queue: Queue;
  left: number;
  onDone: (id: string, decision: "validated" | "rejected") => void;
  onSkip: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [panel, setPanel] = useState<Panel>("main");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .photoUrl(item.storagePath)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setPhotoError(true));
    return () => {
      alive = false;
    };
  }, [api, item.storagePath]);

  async function act(run: () => Promise<void>, decision: "validated" | "rejected") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await run();
      onDone(item.id, decision);
    } catch {
      setError("Décision non enregistrée. Réessayez.");
      setBusy(false);
    }
  }
  const label = (id: string) => speciesLabel(queue.species, id);
  const top = item.suggestions[0];

  return (
    <section className="panel mt-6 overflow-hidden" aria-label="Photo à vérifier">
      <div className="flex aspect-[4/3] items-center justify-center bg-black/40">
        {url ? (
          <img
            src={url}
            alt="Photo envoyée par un pêcheur"
            className="h-full w-full object-contain"
            onError={() => setPhotoError(true)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {photoError ? "Photo introuvable." : "Chargement de la photo…"}
          </p>
        )}
      </div>
      <div className="p-5">
        <dl className="grid gap-2 text-sm">
          <Row term="Le pêcheur dit">
            <strong className="text-base">{label(item.speciesChosen)}</strong>
          </Row>
          <Row term="Le modèle proposait">
            {top
              ? item.suggestions.map((s) => `${label(s.speciesId)} ${percent(s.score)}`).join(" · ")
              : "Rien (photo non reconnue)"}
          </Row>
          {(item.riverLabel || item.caughtOn) && (
            <Row term="Prise">
              {[item.riverLabel, item.caughtOn && formatDate(item.caughtOn)]
                .filter(Boolean)
                .join(" · ")}
            </Row>
          )}
          {item.triageReasons.length > 0 && (
            <Row term="Pourquoi la vérifier">
              {item.triageReasons.map(triageReasonLabel).join(" ; ")}
            </Row>
          )}
        </dl>

        {panel === "main" && (
          <div className="mt-5 grid gap-2">
            <Action
              tone="primary"
              disabled={busy}
              onClick={() => void act(() => api.validate(item.id, item.speciesChosen), "validated")}
            >
              ✅ Le pêcheur a raison
            </Action>
            <Action disabled={busy} onClick={() => setPanel("species")}>
              🔄 C’est une autre espèce…
            </Action>
            <Action tone="danger" disabled={busy} onClick={() => setPanel("reject")}>
              ❌ Rejeter
            </Action>
            <Action tone="quiet" disabled={busy} onClick={onSkip}>
              ⏭ Je ne sais pas, passer
            </Action>
          </div>
        )}

        {panel === "species" && (
          <div className="mt-5">
            <p className="text-sm font-medium">Quelle espèce est-ce ?</p>
            <div className="mt-2 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
              {queue.species
                .filter((s) => s.id !== item.speciesChosen)
                .map((s) => (
                  <Action
                    key={s.id}
                    disabled={busy}
                    onClick={() => void act(() => api.validate(item.id, s.id), "validated")}
                  >
                    {s.label}
                  </Action>
                ))}
            </div>
            <Action tone="quiet" disabled={busy} onClick={() => setPanel("main")}>
              Retour
            </Action>
          </div>
        )}

        {panel === "reject" && (
          <div className="mt-5 grid gap-2">
            <p className="text-sm font-medium">
              Pourquoi rejeter cette photo ? Elle sera supprimée.
            </p>
            {REJECT_REASONS.map((r) => (
              <Action
                key={r.id}
                tone="danger"
                disabled={busy}
                onClick={() => void act(() => api.reject(item, r.id as RejectReason), "rejected")}
              >
                {r.label}
              </Action>
            ))}
            <Action tone="quiet" disabled={busy} onClick={() => setPanel("main")}>
              Retour
            </Action>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {left} photo{left > 1 ? "s" : ""} en attente
        </p>
      </div>
    </section>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function Action({
  children,
  onClick,
  disabled,
  tone = "default",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger" | "quiet";
}) {
  const style = {
    default: "bg-secondary text-secondary-foreground",
    primary: "bg-primary text-primary-foreground font-semibold",
    danger: "bg-destructive/15 text-foreground border border-destructive/50",
    quiet: "bg-transparent text-muted-foreground",
  }[tone];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded-lg px-4 py-3 text-left text-sm ${style}`}
    >
      {children}
    </button>
  );
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
