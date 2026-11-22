import { useState } from "react";
import { api } from "../api";
import { REPORT_REASONS, URGENT_REASONS } from "../options";
import { DialogFocus } from "./DialogFocus";
import { useTabData } from "../features/navigation/tabData";

type Props = {
  // Se reporta a una persona (userId) o a un grupo (groupId)
  userId?: string;
  groupId?: string;
  name: string;
  messageId?: string;
  messageKind?: "group" | "dm";
  onClose: () => void;
};

export function ReportDialog({ userId, groupId, name, messageId, messageKind, onClose }: Props) {
  const { refreshAfterBlock } = useTabData();
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [blockResult, setBlockResult] = useState<"ok" | "error" | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function send() {
    setState("sending");
    try {
      await api("/reports", { method: "POST", json: { userId, groupId, reason, details: details || undefined, messageId, messageKind } });
      if (userId && alsoBlock) {
        try {
          await api("/blocks", { method: "POST", json: { userId } });
          refreshAfterBlock();
          setBlockResult("ok");
        } catch {
          setBlockResult("error");
        }
      }
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet sheet--tall" role="dialog" aria-modal aria-labelledby="report-title" onClick={(e) => e.stopPropagation()}>
        <DialogFocus onClose={onClose} />
        {state === "done" ? (
          <>
            <h2 id="report-title">Gracias por avisar</h2>
            <p className="muted">
              Vamos a revisar el reporte. {blockResult === "ok" && "También bloqueaste a esta persona."}
              {blockResult === "error" && "El reporte se envió. Podés volver a intentar el bloqueo desde su perfil."}
            </p>
            <button className="btn btn--primary" onClick={onClose}>Listo</button>
          </>
        ) : (
          <>
            <h2 id="report-title">Reportar {groupId ? "el grupo " : messageId ? "mensaje de " : "a "}{name}</h2>
            <div className="sheet__body form">
            <p className="muted small">Tu reporte lo recibe moderación.</p>
            <div className="chips">
              {REPORT_REASONS.map((r) => (
                <button key={r} className={`chip ${reason === r ? "chip--on" : ""}`} aria-pressed={reason === r} onClick={() => setReason(r)}>
                  {r}
                </button>
              ))}
            </div>
            {URGENT_REASONS.includes(reason) && (
              <p className="report-urgent small">
                Revisamos este motivo primero. Si alguien está en peligro inmediato, comunicate con el servicio local de emergencias.
              </p>
            )}
            <textarea
              className="input"
              placeholder="Contanos más (opcional)"
              rows={3}
              maxLength={1000}
              value={details}
              aria-label="Detalles del reporte"
              onChange={(e) => setDetails(e.target.value)}
            />
            {userId && <label className="check"><input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} /><span>También bloquear a esta persona</span></label>}
            {state === "error" && <p className="error">No se pudo mandar el reporte. Probá de nuevo.</p>}
            </div>
            <div className="row">
              <button className="btn" onClick={onClose}>Cancelar</button>
              <button className="btn btn--danger" disabled={!reason || state === "sending"} onClick={send}>
                {state === "sending" ? "Mandando…" : "Reportar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
