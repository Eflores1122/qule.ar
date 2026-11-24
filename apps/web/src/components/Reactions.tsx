import { MESSAGE_REACTIONS, REACTIONS, reactionLabel, reactionSrc, type ReactionSummary } from "../reactions";

export function ReactionIcon({ kind, size = 20 }: { kind: string; size?: number }) {
  return <img src={reactionSrc(kind)} alt="" width={size} height={size} className="reaction-icon" draggable={false} />;
}

/**
 * Reacciones para elegir. `current` queda marcada (tocarla de nuevo la saca).
 * Con `toque`, solo las que se mandan como toque (sin la risa).
 */
export function ReactionPicker({ current, onPick, label = "Reaccionar", toque = false }: { current?: string | null; onPick: (kind: string) => void; label?: string; toque?: boolean }) {
  return (
    <div className="reaction-picker" role="group" aria-label={label}>
      {(toque ? REACTIONS : MESSAGE_REACTIONS).map((r) => (
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

/** Las reacciones que tiene un mensaje, debajo de la burbuja. Tocar una pone o saca la tuya. */
export function ReactionBar({ reactions, myId, onToggle, mine = false }: { reactions: ReactionSummary[]; myId?: string; onToggle: (kind: string) => void; mine?: boolean }) {
  if (!reactions.length) return null;
  return (
    <div className={`reaction-bar ${mine ? "reaction-bar--mine" : ""}`}>
      {reactions.map((r) => {
        const on = Boolean(myId && r.by.includes(myId));
        return (
          <button
            key={r.kind}
            type="button"
            className={`reaction-chip ${on ? "reaction-chip--on" : ""}`}
            onClick={(e) => { e.stopPropagation(); onToggle(r.kind); }}
            aria-pressed={on}
            aria-label={`${reactionLabel(r.kind)}: ${r.by.length}${on ? ", la tuya" : ""}`}
          >
            <ReactionIcon kind={r.kind} size={18} />
            {r.by.length > 1 && <span>{r.by.length}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** La reacción que puse yo en un mensaje, si puse alguna. */
export const myReaction = (reactions: ReactionSummary[], myId?: string) =>
  myId ? reactions.find((r) => r.by.includes(myId))?.kind ?? null : null;
