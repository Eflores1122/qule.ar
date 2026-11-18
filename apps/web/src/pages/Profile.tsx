import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { api, type PublicProfile } from "../api";
import { BackIcon, LockIcon, StarIcon } from "../components/Icons";
import { useMe } from "../App";
import { ReportDialog } from "../components/ReportDialog";

type StatsInput = Pick<PublicProfile, "about" | "heightCm" | "weightKg" | "bodyType" | "position" | "relationship" | "pronouns" | "hivStatus" | "lastTested" | "tribes" | "lookingFor">;

export function ProfileStats({ p }: { p: StatsInput }) {
  const rows: [string, string | null][] = [
    ["Altura", p.heightCm ? `${p.heightCm} cm` : null],
    ["Peso", p.weightKg ? `${p.weightKg} kg` : null],
    ["Contextura", p.bodyType],
    ["Rol", p.position],
    ["Relación", p.relationship],
    ["Pronombres", p.pronouns],
    ["Estado serológico", p.hivStatus],
    ["Último test", p.lastTested ? new Date(p.lastTested + "T12:00").toLocaleDateString("es-AR", { month: "long", year: "numeric" }) : null],
  ];
  const visible = rows.filter(([, v]) => v);
  return (
    <>
      {p.about && <p className="profile__about">{p.about}</p>}
      {visible.length > 0 && (
        <dl className="stats">
          {visible.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      )}
      {p.tribes.length > 0 && (
        <section className="profile__section">
          <h3>Tribus</h3>
          <div className="chips">{p.tribes.map((t) => <span key={t} className="chip chip--static">{t}</span>)}</div>
        </section>
      )}
      {p.lookingFor.length > 0 && (
        <section className="profile__section">
          <h3>Busca</h3>
          <div className="chips">{p.lookingFor.map((t) => <span key={t} className="chip chip--static">{t}</span>)}</div>
        </section>
      )}
    </>
  );
}

export function ProfilePage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState<PublicProfile | null>(null);
  const [missing, setMissing] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const { me } = useMe();
  const hasOwnAlbum = Boolean(me?.photos.some((x) => x.isPrivate));

  useEffect(() => {
    setP(null);
    setMissing(false);
    setPhotoIdx(0);
    api<PublicProfile>(`/users/${id}`).then(setP).catch(() => setMissing(true));
  }, [id]);

  async function message() {
    const { id: convId } = await api<{ id: string }>("/conversations", { method: "POST", json: { userId: id } });
    nav(`/mensajes/${convId}`);
  }

  async function toggleFavorite() {
    if (!p) return;
    const fav = !p.favorite;
    setP({ ...p, favorite: fav });
    await api(`/favorites/${id}`, { method: fav ? "PUT" : "DELETE" }).catch(() => setP({ ...p, favorite: !fav }));
  }

  async function toggleShareAlbum() {
    if (!p) return;
    const share = !p.iSharedAlbum;
    await api(`/album/grants/${id}`, { method: share ? "PUT" : "DELETE" });
    setP({ ...p, iSharedAlbum: share });
  }

  async function doBlock() {
    await api("/blocks", { method: "POST", json: { userId: id } });
    nav(-1);
  }

  if (missing) {
    return (
      <div className="page">
        <header className="topbar"><button className="iconbtn" onClick={() => nav(-1)} aria-label="Volver"><BackIcon /></button></header>
        <div className="empty"><p className="empty__title">Este perfil no está disponible</p></div>
      </div>
    );
  }
  if (!p) return <div className="page" />;

  return (
    <div className="page profile">
      <div className="profile__photo">
        {p.photos.length ? (
          <img src={p.photos[photoIdx]} alt={`Foto de ${p.displayName}`} />
        ) : (
          <div className="profile__nophoto">{p.displayName.charAt(0).toUpperCase()}</div>
        )}
        <button className="iconbtn iconbtn--float" onClick={() => nav(-1)} aria-label="Volver"><BackIcon /></button>
        {p.photos.length > 1 && (
          <div className="profile__dots">
            {p.photos.map((_, i) => (
              <button key={i} aria-label={`Foto ${i + 1}`} className={i === photoIdx ? "on" : ""} onClick={() => setPhotoIdx(i)} />
            ))}
          </div>
        )}
        {p.photos.length > 1 && (
          <>
            <button className="profile__tap profile__tap--prev" aria-label="Foto anterior" onClick={() => setPhotoIdx((i) => (i - 1 + p.photos.length) % p.photos.length)} />
            <button className="profile__tap profile__tap--next" aria-label="Foto siguiente" onClick={() => setPhotoIdx((i) => (i + 1) % p.photos.length)} />
          </>
        )}
        <div className="profile__name">
          <div className="profile__nameline">
            <h1>{p.displayName}</h1>
            <span>{p.age}</span>
          </div>
          {(p.online || p.recent || p.distance) && (
            <p className="profile__status">
              {p.online ? <><i className="dot dot--on" /> En línea</> : p.recent ? <><i className="dot dot--recent" /> Hace un rato</> : null}
              {(p.online || p.recent) && p.distance && " · "}
              {p.distance}
            </p>
          )}
        </div>
      </div>

      <div className="profile__body">
        {!p.isMe && (
          <div className="row">
            <button className="btn btn--primary btn--grow" onClick={message}>Mandar mensaje</button>
            <button
              className={`btn btn--icon ${p.favorite ? "btn--fav" : ""}`}
              onClick={toggleFavorite}
              aria-pressed={p.favorite}
              aria-label={p.favorite ? "Sacar de favoritos" : "Agregar a favoritos"}
            >
              <StarIcon filled={p.favorite} />
            </button>
          </div>
        )}

        {p.privateAlbum && (
          <section className="album">
            <h3 className="album__title"><LockIcon /> Álbum privado · {p.privateAlbum.count} {p.privateAlbum.count === 1 ? "foto" : "fotos"}</h3>
            {p.privateAlbum.photos ? (
              <div className="album__grid">
                {p.privateAlbum.photos.map((src, i) => (
                  <img key={src} src={src} alt={`Foto privada ${i + 1} de ${p.displayName}`} loading="lazy" />
                ))}
              </div>
            ) : (
              <p className="muted small">{p.displayName} todavía no te compartió su álbum.</p>
            )}
          </section>
        )}

        <ProfileStats p={p} />

        {!p.isMe && hasOwnAlbum && (
          <button className="btn btn--ghost" onClick={toggleShareAlbum}>
            <LockIcon /> {p.iSharedAlbum ? "Dejar de compartir mi álbum privado" : "Compartirle mi álbum privado"}
          </button>
        )}
        {!p.isMe && (
          <div className="profile__safety">
            {confirmBlock ? (
              <div className="confirm">
                <p>¿Bloquear a {p.displayName}? No van a poder verse ni escribirse, y dejás de ver sus mensajes en los grupos.</p>
                <div className="row">
                  <button className="btn" onClick={() => setConfirmBlock(false)}>Cancelar</button>
                  <button className="btn btn--danger" onClick={doBlock}>Bloquear</button>
                </div>
              </div>
            ) : (
              <div className="row">
                <button className="btn btn--ghost" onClick={() => setConfirmBlock(true)}>Bloquear</button>
                <button className="btn btn--ghost" onClick={() => setReporting(true)}>Reportar</button>
              </div>
            )}
          </div>
        )}
      </div>
      {reporting && <ReportDialog userId={p.id} name={p.displayName} onClose={() => setReporting(false)} />}
    </div>
  );
}
