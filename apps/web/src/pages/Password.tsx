import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { MIN_PASSWORD_LENGTH } from "../../../../packages/security/password.js";
import { accessCopy as copy } from "../access";
import { authClient } from "../api";
import { AccessLayout } from "../components/AccessLayout";

/** Pedir el mail para recuperar la contraseña. */
export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      const res = await authClient.requestPasswordReset({ email, redirectTo: "/nueva-clave" });
      // Mismo mensaje para cualquier dirección, aunque no tenga cuenta.
      if (res.error && res.error.status !== 404) setFailed(true);
      else setSent(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccessLayout compact>
      <section className="access__form">
        <h1 className="access__title">{copy.recoverTitle}</h1>
        {sent ? (
          <div className="stack" role="status">
            <p>{copy.recoverSent(email)}</p>
            <p className="muted small">{copy.recoverInbox}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="form">
            <p className="muted">{copy.recoverHelp}</p>
            <label className="field">
              <span>{copy.email}</span>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            {failed && <p className="error" role="alert">{copy.failed}</p>}
            <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? copy.busy : copy.sendLink}</button>
          </form>
        )}
        <Link to="/entrar" className="linkbtn">{copy.back}</Link>
      </section>
    </AccessLayout>
  );
}

/** Elegir la contraseña nueva, con el token que llega por mail. */
export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"invalidLink" | "mismatch" | "tooShort" | "failed" | null>(null);
  const [done, setDone] = useState(false);
  const message = error === "tooShort" ? copy.minimum(MIN_PASSWORD_LENGTH) : error && copy[error];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== repeat) return setError("mismatch");
    if (!token) return setError("invalidLink");
    setBusy(true);
    setError(null);
    try {
      const res = await authClient.resetPassword({ newPassword: password, token });
      if (res.error?.code === "INVALID_TOKEN") setError("invalidLink");
      else if (res.error?.code === "PASSWORD_TOO_SHORT") setError("tooShort");
      else if (res.error) setError("failed");
      else setDone(true);
    } catch {
      setError("failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccessLayout compact>
      <section className="access__form">
        <h1 className="access__title">{copy.newPassword}</h1>
        {done ? (
          <>
            <p role="status">{copy.resetDone}</p>
            <button className="btn btn--primary" type="button" onClick={() => nav("/entrar", { replace: true })}>{copy.signIn}</button>
          </>
        ) : !token || params.has("error") || error === "invalidLink" ? (
          <>
            <p className="muted" role="status">{copy.invalidLink}</p>
            <Link to="/recuperar" className="linkbtn">{copy.requestNew}</Link>
          </>
        ) : (
          <form onSubmit={submit} className="form">
            <label className="field">
              <span>{copy.newPassword}</span>
              <input className="input" type="password" required minLength={MIN_PASSWORD_LENGTH} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-describedby="reset-password-minimum" />
              <small className="muted" id="reset-password-minimum">{copy.minimum(MIN_PASSWORD_LENGTH)}</small>
            </label>
            <label className="field">
              <span>{copy.repeat}</span>
              <input className="input" type="password" required minLength={MIN_PASSWORD_LENGTH} value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
            </label>
            {message && <p className="error" role="alert">{message}</p>}
            <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? copy.busy : copy.savePassword}</button>
          </form>
        )}
      </section>
    </AccessLayout>
  );
}
