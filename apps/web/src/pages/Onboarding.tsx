import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, authClient } from "../api";
import { accessCopy as copy } from "../access";
import { useMe } from "../App";
import { AccessLayout } from "../components/AccessLayout";
import { Markdown } from "../components/Markdown";
import terminos from "../legal/terminos.md?raw";

function maxBirthdate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().slice(0, 10);
}

export function Onboarding() {
  const { me, reload } = useMe();
  const nav = useNavigate();
  const [displayName, setDisplayName] = useState(me?.user.name ?? "");
  const [birthdate, setBirthdate] = useState("");
  const [adult, setAdult] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  // Los términos se leen acá mismo; el tilde de aceptarlos se habilita recién cuando se abren
  const [showTerms, setShowTerms] = useState(false);
  const [openedTerms, setOpenedTerms] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/me/profile", { method: "PUT", json: { displayName, birthdate, acceptTerms } });
      await reload();
      nav("/yo/editar?nuevo=1", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "UNKNOWN");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccessLayout compact>
      <form className="form" onSubmit={submit}>
        <h1 className="access__title">{copy.profileTitle}</h1>
        <label className="field">
          <span>{copy.displayName}</span>
          <input className="input" required maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="field">
          <span>{copy.birthdate}</span>
          <input className="input" type="date" required max={maxBirthdate()} value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
          <small className="muted">{copy.birthdayHint}</small>
        </label>
        <label className="check">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          <span>{copy.adult}</span>
        </label>
        <div className="beta-notice" role="note">
          <p className="beta-notice__title">{copy.betaTitle}</p>
          <p>{copy.betaNotice}</p>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            aria-expanded={showTerms}
            onClick={() => {
              setShowTerms((v) => !v);
              setOpenedTerms(true);
            }}
          >
            {showTerms ? copy.hideTerms : copy.showTerms}
          </button>
          {showTerms && (
            <div className="beta-notice__terms legal__body" lang="es" tabIndex={0} aria-label="Términos y condiciones">
              <Markdown source={terminos} />
            </div>
          )}
        </div>
        <label className={`check ${openedTerms ? "" : "check--disabled"}`}>
          <input type="checkbox" disabled={!openedTerms} checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
          <span>
            {copy.acceptedTerms} <Link to="/privacidad" target="_blank">{copy.privacyPolicy}</Link>. {copy.acceptedBeta}
            {!openedTerms && <small className="muted check__hint">{copy.readFirst}</small>}
          </span>
        </label>
        {error && <p className="error" role="alert">{error !== "UNKNOWN" ? error : copy.failed}</p>}
        <button className="btn btn--primary" type="submit" disabled={!adult || !acceptTerms || busy}>{busy ? copy.busy : copy.enterApp}</button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={async () => {
            await authClient.signOut();
            await reload();
          }}
        >
          {copy.signOut}
        </button>
      </form>
    </AccessLayout>
  );
}
