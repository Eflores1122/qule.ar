import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, type AlbumGrant } from "../../api";
import { useMe } from "../../App";
import { SHARE_OPTIONS, untilLabel } from "../../components/AlbumViewer";
import { BackIcon, LockIcon } from "../../components/Icons";

/**
 * Compartir el álbum privado desde el chat, con el mismo plazo que en el perfil.
 * El aviso le llega a la otra persona como mensaje en esta conversación (lo manda la API por el socket).
 */
export function ShareAlbumMenu({ userId, onBack, onDone, onError }: {
  userId: string;
  onBack: () => void;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const { me } = useMe();
  const hasAlbum = Boolean(me?.photos.some((x) => x.isPrivate));
  // undefined: cargando; null: no se lo compartí; si no, hasta cuándo (expiresAt null = sin límite)
  const [grant, setGrant] = useState<{ expiresAt: string | null } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasAlbum) return;
    let alive = true;
    api<AlbumGrant[]>("/album/grants")
      .then((list) => alive && setGrant(list.find((g) => g.id === userId) ?? null))
      .catch(() => alive && setGrant(null));
    return () => {
      alive = false;
    };
  }, [hasAlbum, userId]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      onDone();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const share = (hours: number | null) => run(() => api(`/album/grants/${userId}`, { method: "PUT", json: { hours } }));
  const unshare = () => run(() => api(`/album/grants/${userId}`, { method: "DELETE" }));

  return (
    <div className="album-menu" role="group" aria-label="Compartir álbum privado">
      <div className="album-menu__head">
        <button type="button" className="iconbtn" aria-label="Volver a las opciones" onClick={onBack}><BackIcon /></button>
        <p className="small"><LockIcon /> Álbum privado</p>
      </div>
      {!hasAlbum ? (
        <p className="muted small">
          Todavía no tenés fotos en tu álbum privado. <Link to="/yo/editar">Sumá alguna desde tu perfil</Link>.
        </p>
      ) : grant === undefined ? (
        <p className="muted small">Cargando…</p>
      ) : (
        <>
          <p className="muted small">
            {grant ? `Ya le compartiste tu álbum · ${untilLabel(grant.expiresAt)}. ¿Cambiamos el plazo?` : "¿Por cuánto tiempo lo puede ver?"}
          </p>
          <div className="chips">
            {SHARE_OPTIONS.map((o) => (
              <button key={o.label} type="button" className="chip" disabled={busy} onClick={() => share(o.hours)}>{o.label}</button>
            ))}
          </div>
          {grant && (
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={unshare}>Dejar de compartir</button>
          )}
        </>
      )}
    </div>
  );
}
