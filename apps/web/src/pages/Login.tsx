import { useEffect, useState } from "react";
import { Link } from "react-router";
import { MIN_PASSWORD_LENGTH } from "../../../../packages/security/password.js";
import { accessCopy as copy } from "../access";
import { api, authClient } from "../api";
import { useMe } from "../App";
import { AccessLayout } from "../components/AccessLayout";
import { GoogleMark } from "../components/GoogleMark";
import { EyeIcon, EyeOffIcon } from "../components/Icons";

export function Login() {
  const { reload } = useMe();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const [canReset, setCanReset] = useState(false);

  useEffect(() => {
    api<{ google: boolean; passwordReset: boolean }>("/config").then((c) => { setGoogle(c.google); setCanReset(c.passwordReset); }).catch(() => {});
  }, []);

  function selectMode(next: "in" | "up") {
    if (next === mode) return;
    setError("");
    setShowPassword(false);
    setMode(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res =
        mode === "up"
          ? await authClient.signUp.email({ name: name || email.split("@")[0], email, password })
          : await authClient.signIn.email({ email, password });
      if (res.error) setError(translate(res.error.code));
      else await reload();
    } catch {
      setError(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccessLayout>
      <section className="access__form" aria-label={copy.account}>
        <div className="access__modes" role="group" aria-label={copy.account} data-mode={mode}>
          <button type="button" aria-pressed={mode === "in"} disabled={busy} onClick={() => selectMode("in")}>{copy.signIn}</button>
          <button type="button" aria-pressed={mode === "up"} disabled={busy} onClick={() => selectMode("up")}>{copy.signUp}</button>
        </div>
        {google && (
          <>
            <button
              className="btn btn--google"
              onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/" })}
            >
              <GoogleMark /> {copy.google}
            </button>
            <div className="divider"><span>{copy.emailAlternative}</span></div>
          </>
        )}

        <form onSubmit={submit} className="form">
          {mode === "up" && (
            <label className="field">
              <span>{copy.name}</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" maxLength={40} />
            </label>
          )}
          <label className="field">
            <span>{copy.email}</span>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <div className="field">
            <label htmlFor="auth-password">{copy.password}</label>
            <div className="password-input">
              <input
                id="auth-password"
                className="input"
                type={showPassword ? "text" : "password"}
                required
                minLength={mode === "up" ? MIN_PASSWORD_LENGTH : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                aria-describedby={mode === "up" ? "password-minimum" : undefined}
                autoCapitalize="none"
                spellCheck={false}
              />
              <button
                type="button"
                className="iconbtn password-input__toggle"
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-controls="auth-password"
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {mode === "up" && <small id="password-minimum" className="muted">{copy.minimum(MIN_PASSWORD_LENGTH)}</small>}
          </div>
          {mode === "in" && canReset && <Link to="/recuperar" className="linkbtn small forgot">{copy.forgot}</Link>}
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? copy.busy : mode === "up" ? copy.signUp : copy.signIn}
          </button>
        </form>
      </section>
    </AccessLayout>
  );
}

function translate(code: string | undefined) {
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD": return copy.invalidCredentials;
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL": return copy.duplicateEmail;
    case "PASSWORD_TOO_SHORT": return copy.minimum(MIN_PASSWORD_LENGTH);
    case "INVALID_EMAIL": return copy.invalidEmail;
    default: return copy.failed;
  }
}

