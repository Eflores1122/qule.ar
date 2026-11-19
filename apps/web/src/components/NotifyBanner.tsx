import { useEffect, useState } from "react";
import { enablePush, pushState, type PushState } from "../push";

const KEY = "mortero:avisos-oculto";
const HIDE_DAYS = 3;

function hiddenRecently() {
  try {
    const t = Number(localStorage.getItem(KEY) || 0);
    return Date.now() - t < HIDE_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * Invita a activar las notificaciones. Sin esto casi nadie las activa (estaban escondidas en Yo)
 * y nunca se entera de que le escribieron. Si la persona dice "Ahora no", vuelve a aparecer en 3 días.
 */
export function NotifyBanner() {
  const [state, setState] = useState<PushState | null>(null);
  const [hidden, setHidden] = useState(hiddenRecently);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hidden) return;
    pushState().then(setState).catch(() => setState(null));
  }, [hidden]);

  if (hidden || (state !== "off" && state !== "ios-install")) return null;

  function hide() {
    setHidden(true);
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* sin storage: se oculta solo por ahora */
    }
  }

  async function enable() {
    setBusy(true);
    const s = await enablePush().catch(() => "off" as PushState);
    setBusy(false);
    setState(s);
    if (s !== "on" && s !== "off") hide();
  }

  return (
    <div className="notify-banner" role="region" aria-label="Activar avisos">
      <div className="notify-banner__text">
        <b>Enterate cuando te escriben</b>
        {state === "ios-install" ? (
          <span className="muted small">En iPhone los avisos llegan solo con la app instalada: en Safari, Compartir → Agregar a inicio.</span>
        ) : (
          <span className="muted small">Activá los avisos. Son discretos: no dicen quién te escribió ni qué.</span>
        )}
      </div>
      <div className="notify-banner__actions">
        {state === "off" && (
          <button className="btn btn--small btn--primary" disabled={busy} onClick={enable}>{busy ? "…" : "Activar"}</button>
        )}
        <button className="linkbtn small muted" onClick={hide}>Ahora no</button>
      </div>
    </div>
  );
}
