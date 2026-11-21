import type { ReactNode } from "react";
import { Link } from "react-router";
import { accessCopy as copy } from "../access";
import street from "../assets/access-street.webp";
import { Logo } from "./Logo";
import { Wordmark } from "./Wordmark";

type AccessLayoutProps = { children: ReactNode; compact?: boolean };

export function AccessLayout({ children, compact = false }: AccessLayoutProps) {
  return (
    <main className={compact ? "access access--compact" : "access"}>
      <header className="access__header">
        <div className="access__brand">
          <Logo className="access__logo" />
          <Wordmark />
        </div>
      </header>
      {!compact && (
        <div className="access__photo">
          <img src={street} alt="" width={1120} height={1140} fetchPriority="high" />
          <div className="access__statement">
            <h1>{copy.headline}</h1>
            <p>{copy.description}</p>
          </div>
        </div>
      )}
      <div className="access__panel">
        <div className="access__content">
          {children}
          <footer className="access__footer">
            <Link to="/terminos">{copy.terms}</Link>
            <Link to="/privacidad">{copy.privacy}</Link>
            <Link to="/seguridad-por-pais">Avisos de seguridad por país</Link>
          </footer>
        </div>
      </div>
    </main>
  );
}
