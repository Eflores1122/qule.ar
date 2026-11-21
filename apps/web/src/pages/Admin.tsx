import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, type Author } from "../api";
import { Avatar } from "../components/Avatar";
import { BackIcon } from "../components/Icons";

type Report = {
  id: string;
  reason: string;
  details: string | null;
  status: "open" | "dismissed" | "actioned";
  urgent: boolean;
  targetAutoHidden: boolean;
  resolution: string | null;
  createdAt: string;
  messageId: string | null;
  messageKind: "group" | "dm" | null;
  message: { body: string | null; photo: boolean; deleted: boolean } | null;
  reporter: Author | null;
  // id null: la cuenta reportada se borró (el reporte queda como prueba)
  target: Omit<Author, "id"> & { id: string | null };
  evidenceFiles: number;
  targetSuspendedAt: string | null;
  targetReportCount: number;
};

type Suspended = Author & { reason: string | null; suspendedAt: string };
type Stats = { users: number; groups: number; openReports: number; suspended: number };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function Admin() {
  const nav = useNavigate();
  const [tab, setTab] = useState<"open" | "closed" | "suspended">("open");
  const [stats, setStats] = useState<Stats | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [suspended, setSuspended] = useState<Suspended[] | null>(null);
  const [suspending, setSuspending] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setStats(await api<Stats>("/admin/stats"));
      if (tab === "suspended") setSuspended(await api<Suspended[]>("/admin/suspended"));
      else setReports(await api<Report[]>(`/admin/reports?status=${tab}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="page">
      <header className="topbar topbar--thread">
        <button className="iconbtn" onClick={() => nav("/yo")} aria-label="Volver"><BackIcon /></button>
        <h1 className="topbar__title topbar__title--sm">Moderación</h1>
      </header>

      {stats && (
        <dl className="kpis">
          <div><dt>Perfiles</dt><dd>{stats.users}</dd></div>
          <div><dt>Grupos</dt><dd>{stats.groups}</dd></div>
          <div className={stats.openReports ? "kpi--alert" : ""}><dt>Reportes abiertos</dt><dd>{stats.openReports}</dd></div>
          <div><dt>Suspendidas</dt><dd>{stats.suspended}</dd></div>
        </dl>
      )}

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "open"} onClick={() => setTab("open")}>Abiertos</button>
        <button role="tab" aria-selected={tab === "closed"} onClick={() => setTab("closed")}>Resueltos</button>
        <button role="tab" aria-selected={tab === "suspended"} onClick={() => setTab("suspended")}>Suspendidas</button>
      </div>

      {error && <div className="notice notice--error" role="alert">{error}</div>}

      {tab !== "suspended" && reports && (
        reports.length === 0 ? (
          <div className="empty"><p className="muted">{tab === "open" ? "No hay reportes pendientes. 🎉" : "Todavía no se resolvió ningún reporte."}</p></div>
        ) : (
          <ul className="reports">
            {reports.map((r) => (
              <li key={r.id} className="rcard">
                <div className="rcard__head">
                  <span className="rcard__pills">
                    {r.urgent && r.status === "open" && <span className="pill pill--urgent">Urgente</span>}
                    <span className="pill pill--reason">{r.reason}</span>
                  </span>
                  <time className="muted small">{fmt(r.createdAt)}</time>
                </div>
                <Link to={r.target.id ? `/perfil/${r.target.id}` : "#"} className="rcard__who">
                  <Avatar src={r.target.photo} name={r.target.name} size={40} />
                  <span>
                    <b>{r.target.name}</b> <span className="muted">{r.target.age || ""}</span>
                    <span className="muted small rcard__count">
                      {r.targetReportCount} {r.targetReportCount === 1 ? "reporte" : "reportes"} en total
                      {r.targetSuspendedAt && " · suspendida"}
                      {r.targetAutoHidden && !r.targetSuspendedAt && " · oculta de la grilla hasta revisar"}
                    </span>
                  </span>
                </Link>
                {r.message && (
                  <blockquote className="rcard__msg">
                    <span className="muted small">{r.messageKind === "group" ? "Mensaje en un grupo" : "Mensaje privado"}{r.message.deleted && " (ya borrado)"}</span>
                    {r.message.body && <p>{r.message.body}</p>}
                    {r.message.photo && <p className="muted">[foto]</p>}
                    {r.message.deleted && r.message.body && <span className="muted small">Copia guardada al reportarlo</span>}
                  </blockquote>
                )}
                {r.details && <p className="rcard__details">“{r.details}”</p>}
                {r.evidenceFiles > 0 && (
                  <p className="muted small">
                    {r.evidenceFiles === 1 ? "1 archivo guardado" : `${r.evidenceFiles} archivos guardados`} como prueba. No lo descargues: si hay que
                    denunciar, lo pide la fiscalía (ver el protocolo).
                  </p>
                )}
                <p className="muted small">Reportado por {r.reporter?.name ?? "una cuenta borrada"}</p>
                {r.status === "open" ? (
                  <div className="rcard__actions">
                    <button className="btn btn--small" onClick={() => act(() => api(`/admin/reports/${r.id}/dismiss`, { method: "POST" }))}>Descartar</button>
                    {r.message && !r.message.deleted && (
                      <button className="btn btn--small" onClick={() => act(() => api(`/admin/reports/${r.id}/delete-message`, { method: "POST" }))}>Borrar mensaje</button>
                    )}
                    {!r.targetSuspendedAt && r.target.id && (
                      <button className="btn btn--small btn--danger" onClick={() => setSuspending(r)}>Suspender</button>
                    )}
                  </div>
                ) : (
                  <p className="small rcard__resolution">{r.status === "dismissed" ? "Descartado" : r.resolution}</p>
                )}
              </li>
            ))}
          </ul>
        )
      )}

      {tab === "suspended" && suspended && (
        suspended.length === 0 ? (
          <div className="empty"><p className="muted">No hay cuentas suspendidas.</p></div>
        ) : (
          <ul className="reports">
            {suspended.map((s) => (
              <li key={s.id} className="rcard">
                <div className="rcard__who">
                  <Avatar src={s.photo} name={s.name} size={40} />
                  <span><b>{s.name}</b><span className="muted small rcard__count">desde {fmt(s.suspendedAt)}</span></span>
                </div>
                {s.reason && <p className="rcard__details">{s.reason}</p>}
                <div className="rcard__actions">
                  <button className="btn btn--small" onClick={() => act(() => api(`/admin/users/${s.id}/unsuspend`, { method: "POST" }))}>Reactivar cuenta</button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {suspending && (
        <SuspendDialog
          report={suspending}
          onClose={() => setSuspending(null)}
          onDone={() => { setSuspending(null); load(); }}
        />
      )}
    </div>
  );
}

function SuspendDialog({ report, onClose, onDone }: { report: Report; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(`Reportes por ${report.reason}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/users/${report.target.id}/suspend`, { method: "POST", json: { reason } });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal aria-labelledby="suspend-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="suspend-title">Suspender a {report.target.name}</h2>
        <p className="muted small">Se cierran sus sesiones, deja de aparecer en la app y se cierran sus reportes abiertos. Se puede reactivar después.</p>
        <label className="field">
          <span>Motivo (la persona lo va a ver)</span>
          <textarea className="input" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn--danger" disabled={busy || reason.trim().length < 3} onClick={submit}>{busy ? "Suspendiendo…" : "Suspender"}</button>
        </div>
      </div>
    </div>
  );
}
