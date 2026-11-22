import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, getSocket } from "../api";
import { BackIcon } from "../components/Icons";

type Report = { id: string; reason: string; createdAt: string; reviewedAt: string | null };
const date = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" });

export function MyReports() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const request = new AbortController();
    setError(false);
    api<Report[]>("/me/reports", { signal: request.signal })
      .then((rows) => { if (!request.signal.aborted) setReports(rows); })
      .catch(() => { if (!request.signal.aborted) setError(true); });
    return () => request.abort();
  }, [refresh]);

  useEffect(() => {
    const socket = getSocket();
    const reload = () => setRefresh((current) => current + 1);
    socket.on("report:reviewed", reload);
    socket.io.on("reconnect", reload);
    return () => {
      socket.off("report:reviewed", reload);
      socket.io.off("reconnect", reload);
    };
  }, []);

  return (
    <div className="page">
      <header className="topbar topbar--thread">
        <Link to="/yo" className="iconbtn" aria-label="Volver a Mi perfil"><BackIcon /></Link>
        <h1 className="topbar__title">Mis reportes</h1>
      </header>
      <section className="section stack" aria-label="Reportes enviados">
        {error && <div role="alert" className="stack">
          <p>No pudimos cargar tus reportes.</p>
          <button type="button" className="btn btn--small" onClick={() => setRefresh((current) => current + 1)}>Reintentar</button>
        </div>}
        {reports === null && !error && <p role="status" className="muted">Cargando…</p>}
        {reports?.length === 0 && <p className="muted">Todavía no enviaste reportes.</p>}
        {reports?.length === 50 && <p className="small muted">Estás viendo tus últimos 50 reportes.</p>}
        {!!reports?.length && (
          <ul className="blocked">
            {reports.map((report) => (
              <li key={report.id}>
                <div className="stack">
                  <b>{report.reason}</b>
                  <time className="muted small" dateTime={report.createdAt}>{date.format(new Date(report.createdAt))}</time>
                </div>
                <span className="pill">{report.reviewedAt ? "Revisado" : "Recibido"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
