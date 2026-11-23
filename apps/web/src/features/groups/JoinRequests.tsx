import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api, getSocket, type JoinRequest, type JoinRequestPage } from "../../api";
import { Avatar } from "../../components/Avatar";

type Filters = { foto: "" | "con" | "sin"; nueva: boolean; edadMin: string; edadMax: string };
const NO_FILTERS: Filters = { foto: "", nueva: false, edadMin: "", edadMax: "" };

const validAge = (s: string) => {
  const n = Number(s);
  return s !== "" && n >= 18 && n <= 99 ? String(n) : null;
};

function query(f: Filters, cursor?: string | null) {
  const q = new URLSearchParams();
  if (f.foto) q.set("foto", f.foto);
  if (f.nueva) q.set("nueva", "1");
  const min = validAge(f.edadMin);
  const max = validAge(f.edadMax);
  if (min) q.set("edadMin", min);
  if (max) q.set("edadMax", max);
  if (cursor) q.set("cursor", cursor);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** ¿`a` va después de `b` en la lista (más vieja)? Mismo orden que la API: fecha y después id. */
const after = (a: JoinRequest, b: JoinRequest) => a.createdAt < b.createdAt || (a.createdAt === b.createdAt && a.id < b.id);

type State = { items: JoinRequest[]; cursor: string | null; total: number };

/**
 * Solicitudes para entrar a un grupo (solo dueño y moderadores):
 * de la más nueva a la más vieja, de a páginas y con filtros.
 */
export function JoinRequests({ groupId, onChanged }: { groupId: string; onChanged: () => void }) {
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [ageOpen, setAgeOpen] = useState(false);
  const [data, setData] = useState<State | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const asked = useRef(0);
  const key = query(f);

  /** Trae la primera página. Con `merge`, conserva lo que ya estaba cargado más abajo. */
  const refresh = useCallback(async (merge: boolean) => {
    const n = ++asked.current;
    try {
      const first = await api<JoinRequestPage>(`/groups/${groupId}/requests${key}`);
      if (n !== asked.current) return;
      setData((prev) => {
        const total = first.total ?? 0;
        if (!merge || !prev || !first.nextCursor || prev.items.length <= first.items.length) {
          return { items: first.items, cursor: first.nextCursor, total };
        }
        // Lo que estaba dentro de la primera página y ya no vino, alguien lo resolvió
        const last = first.items[first.items.length - 1];
        const ids = new Set(first.items.map((r) => r.id));
        const older = prev.items.filter((r) => !ids.has(r.id) && after(r, last));
        return { items: [...first.items, ...older], cursor: prev.cursor, total };
      });
    } catch (e) {
      if (n === asked.current) setError((e as Error).message);
    }
  }, [groupId, key]);

  // Al cambiar los filtros, de cero (la edad espera a que termines de escribir)
  useEffect(() => {
    setData(null);
    const t = setTimeout(() => refresh(false), f.edadMin || f.edadMax ? 400 : 0);
    return () => clearTimeout(t);
  }, [refresh, f.edadMin, f.edadMax]);

  useEffect(() => {
    const s = getSocket();
    const on = (p: { groupId: string }) => p.groupId === groupId && refresh(true);
    s.on("group:request", on);
    return () => {
      s.off("group:request", on);
    };
  }, [groupId, refresh]);

  async function more() {
    if (!data?.cursor || loadingMore) return;
    setLoadingMore(true);
    const n = asked.current;
    try {
      const page = await api<JoinRequestPage>(`/groups/${groupId}/requests${query(f, data.cursor)}`);
      if (n !== asked.current) return;
      setData((prev) => {
        if (!prev) return prev;
        const ids = new Set(prev.items.map((r) => r.id));
        return { ...prev, items: [...prev.items, ...page.items.filter((r) => !ids.has(r.id))], cursor: page.nextCursor };
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function decide(r: JoinRequest, decision: "accept" | "reject") {
    setError("");
    const drop = () => setData((prev) => prev && { ...prev, items: prev.items.filter((x) => x.id !== r.id), total: Math.max(0, prev.total - 1) });
    try {
      await api(`/groups/${groupId}/requests/${r.id}/${decision}`, { method: "POST" });
      drop();
    } catch (e) {
      const msg = (e as Error).message;
      if (/ya fue resuelta/i.test(msg)) drop();
      else setError(msg);
    }
    onChanged();
  }

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const active = key !== "" || ageOpen;

  return (
    <div className="req-panel">
      <div className="invite-filters" role="group" aria-label="Filtros de solicitudes">
        <button type="button" className={`chip ${f.foto === "con" ? "chip--on" : ""}`} aria-pressed={f.foto === "con"} onClick={() => set("foto", f.foto === "con" ? "" : "con")}>Con foto</button>
        <button type="button" className={`chip ${f.foto === "sin" ? "chip--on" : ""}`} aria-pressed={f.foto === "sin"} onClick={() => set("foto", f.foto === "sin" ? "" : "sin")}>Sin foto</button>
        <button type="button" className={`chip ${f.nueva ? "chip--on" : ""}`} aria-pressed={f.nueva} onClick={() => set("nueva", !f.nueva)}>Cuenta nueva</button>
        <button type="button" className={`chip ${ageOpen || f.edadMin || f.edadMax ? "chip--on" : ""}`} aria-expanded={ageOpen} onClick={() => setAgeOpen(!ageOpen)}>Edad</button>
      </div>
      {ageOpen && (
        <div className="invite-more">
          <label className="field field--inline">
            <span>Edad</span>
            <input className="input input--num" inputMode="numeric" placeholder="18" value={f.edadMin} onChange={(e) => set("edadMin", e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label="Edad mínima" />
            <span className="muted">a</span>
            <input className="input input--num" inputMode="numeric" placeholder="99" value={f.edadMax} onChange={(e) => set("edadMax", e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label="Edad máxima" />
          </label>
        </div>
      )}

      <div className="invite-count muted small" role="status">
        {data
          ? data.total === 0
            ? key ? "Ninguna solicitud con estos filtros." : "No hay solicitudes pendientes."
            : `${data.total} ${data.total === 1 ? "solicitud" : "solicitudes"}, de la más nueva a la más vieja`
          : "Buscando…"}
        {active && <button type="button" className="linkbtn small" onClick={() => { setF(NO_FILTERS); setAgeOpen(false); }}>Sacar filtros</button>}
      </div>

      {error && <div className="notice notice--error" role="alert">{error}</div>}

      {data && data.items.length > 0 && (
        <ul className="reqs">
          {data.items.map((r) => (
            <li key={r.id} className="req">
              <Link to={`/perfil/${r.user.id}`} className="req__who">
                <Avatar src={r.user.photo} name={r.user.name} size={44} />
                <span className="req__name">
                  <span><b>{r.user.name}</b> <span className="muted">{r.user.age}</span></span>
                  <span className="muted small">{since(r.createdAt)}{r.newAccount ? " · cuenta nueva" : ""}</span>
                </span>
              </Link>
              {r.message && <p className="req__msg">“{r.message}”</p>}
              <div className="row">
                <button className="btn btn--small" onClick={() => decide(r, "reject")}>Rechazar</button>
                <button className="btn btn--small btn--primary" onClick={() => decide(r, "accept")}>Aceptar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data?.cursor && (
        <button type="button" className="btn btn--ghost" onClick={more} disabled={loadingMore}>
          {loadingMore ? "Cargando…" : "Ver más solicitudes"}
        </button>
      )}
    </div>
  );
}

/** "Hace 5 min", "hace 3 h", "hace 2 días". */
function since(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "Recién";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.round(h / 24);
  return `Hace ${d} ${d === 1 ? "día" : "días"}`;
}
