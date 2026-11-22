import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api";
import { REACTIONS, reactionLabel, reactionSrc, type ReactionSummary } from "../reactions";
import { ReactionAddIcon } from "./Icons";

export function ReactionIcon({ kind, size = 20 }: { kind: string; size?: number }) {
  return <img src={reactionSrc(kind)} alt="" width={size} height={size} className="reaction-icon" draggable={false} />;
}

/** Fila con las 8 reacciones para elegir. `current` queda marcada (tocarla de nuevo la saca). */
export function ReactionPicker({ current, onPick, label = "Reaccionar" }: { current?: string | null; onPick: (kind: string) => void; label?: string }) {
  return (
    <div className="reaction-picker" role="group" aria-label={label}>
      {REACTIONS.map((r) => (
        <button
          key={r.kind}
          type="button"
          className={`reaction-picker__btn ${current === r.kind ? "reaction-picker__btn--on" : ""}`}
          onClick={() => onPick(r.kind)}
          aria-label={r.label}
          aria-pressed={current === r.kind}
          title={r.label}
        >
          <ReactionIcon kind={r.kind} size={28} />
        </button>
      ))}
    </div>
  );
}

/** El selector y las reacciones del mensaje. Tocar una existente pone o saca la tuya. */
export function MessageReactions({ reactions, myId, mine = false, scope, messageId, onUpdate }: {
  reactions: ReactionSummary[]; myId?: string; mine?: boolean; scope: "dm" | "group";
  messageId: string; onUpdate: (reactions: ReactionSummary[]) => void;
}) {
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const saving = useRef(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const current = myReaction(reactions, myId);

  useEffect(() => {
    if (open) (panel.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
      ?? panel.current?.querySelector<HTMLButtonElement>("button"))?.focus();
  }, [open]);

  async function choose(kind: string) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(false);
    try {
      const result = await api<{ reactions: ReactionSummary[] }>(`/reactions/${scope}/${messageId}`, {
        method: "PUT", json: { kind: current === kind ? null : kind, mode: "set" },
      });
      onUpdate(result.reactions);
      if (panel.current?.contains(document.activeElement)) trigger.current?.focus();
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <div className={`message-reactions ${mine ? "message-reactions--mine" : ""}`}
      onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        e.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }}>
      <div className="reaction-bar">
        {reactions.map((r) => {
          const on = Boolean(myId && r.by.includes(myId));
          return (
            <button
              key={r.kind}
              type="button"
              className={`reaction-chip ${on ? "reaction-chip--on" : ""}`}
              onClick={() => choose(r.kind)}
              aria-disabled={busy}
              aria-pressed={on}
              aria-label={`${reactionLabel(r.kind)}: ${r.by.length}${on ? ", la tuya" : ""}`}
            >
              <ReactionIcon kind={r.kind} size={18} />
              <span>{r.by.length}</span>
            </button>
          );
        })}
        <button ref={trigger} type="button" className="reaction-add" onClick={() => setOpen((value) => !value)}
          aria-expanded={open} aria-controls={open ? panelId : undefined} aria-label="Reaccionar al mensaje" title="Reaccionar al mensaje">
          <ReactionAddIcon />
        </button>
      </div>
      {open && (
        <div id={panelId} ref={panel} className="message-reactions__picker" aria-busy={busy}>
          <ReactionPicker current={current} onPick={choose} label="Elegí una reacción" />
        </div>
      )}
      {error && <p className="muted small" role="alert">No se guardó la reacción. Probá de nuevo.</p>}
    </div>
  );
}

/** La reacción que puse yo en un mensaje, si puse alguna. */
const myReaction = (reactions: ReactionSummary[], myId?: string) =>
  myId ? reactions.find((r) => r.by.includes(myId))?.kind ?? null : null;
