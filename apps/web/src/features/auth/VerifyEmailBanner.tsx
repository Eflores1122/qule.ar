import { useState } from "react";
import { authClient } from "../../api";
import { useMe } from "../../App";

const DISMISSED = "qule:aviso-confirmar-mail";

/**
 * Aviso para confirmar el mail. A las cuentas nuevas sin confirmar no se las muestra en Gente, así que el aviso
 * queda fijo. A las de antes, que siguen apareciendo, se les pide igual, pero lo pueden cerrar.
 */
export function VerifyEmailBanner() {
  const { me } = useMe();
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED) === "1");

  if (!me?.profile || me.user.emailVerified) return null;
  if (me.user.listed && dismissed) return null;

  async function resend() {
    setState("busy");
    const res = await authClient.sendVerificationEmail({ email: me!.user.email, callbackURL: "/" });
    setState(res.error ? "error" : "sent");
  }

  function dismiss() {
    localStorage.setItem(DISMISSED, "1");
    setDismissed(true);
  }

  return (
    <div className="notify-banner" role="region" aria-label="Confirmar mail">
      <div className="notify-banner__text">
        <b>{me.user.listed ? "Confirmá tu mail" : "Confirmá tu mail para aparecer en Gente"}</b>
        <span className="muted small">
          {state === "sent"
            ? `Listo, te mandamos un link a ${me.user.email}. Mirá también en spam.`
            : me.user.listed
              ? `Así sabemos que ${me.user.email} es tuyo y podés recuperar la cuenta si te olvidás la contraseña.`
              : `Te mandamos un link a ${me.user.email}. Mientras tanto podés armar tu perfil.`}
        </span>
        {state === "error" && <span className="error small" role="alert">No se pudo mandar. Probá en un rato.</span>}
      </div>
      <div className="notify-banner__actions">
        {state !== "sent" && (
          <button className="btn btn--small btn--primary" disabled={state === "busy"} onClick={resend}>
            {state === "busy" ? "…" : me.user.listed ? "Mandame el link" : "Reenviar"}
          </button>
        )}
        {me.user.listed && <button className="btn btn--small btn--ghost" onClick={dismiss}>Ahora no</button>}
      </div>
    </div>
  );
}
