import { Link } from "react-router";
import { useMe } from "../App";
import { Avatar } from "../components/Avatar";
import { useTabData } from "../features/navigation/tabData";

function ago(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

export function Inbox() {
  const { me } = useMe();
  const { conversations: list } = useTabData();

  return (
    <div className="page">
      <header className="topbar"><h1 className="topbar__title">Mensajes</h1></header>
      {list === null ? null : list.length === 0 ? (
        <div className="empty">
          <p className="empty__title">Sin mensajes por ahora</p>
          <p className="muted">Tocá la foto de alguien en el chat general para ver su perfil y escribirle.</p>
        </div>
      ) : (
        <ul className="inbox">
          {list.map((c) => {
            const mine = c.last.senderId === me?.user.id;
            const preview =
              c.last.kind === "album" ? "🔒 Álbum privado compartido"
              : c.last.expiring ? "⏱ Foto temporal"
              : c.last.kind === "photo" || c.last.photo ? "📷 Foto"
              : c.last.body;
            return (
              <li key={c.id}>
                <Link to={`/mensajes/${c.id}`} className={`inbox__item ${c.unread ? "inbox__item--unread" : ""}`}>
                  <Avatar src={c.other?.photo ?? null} name={c.other?.name ?? "?"} size={52} />
                  <div className="inbox__text">
                    <div className="inbox__top">
                      <b>{c.other?.name ?? "Cuenta borrada"}</b>
                      <time>{ago(c.last.createdAt)}</time>
                    </div>
                    <p className="inbox__preview">{mine && "Vos: "}{preview}</p>
                  </div>
                  {c.unread > 0 && <span className="badge badge--inline">{c.unread}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
