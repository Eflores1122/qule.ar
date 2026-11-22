import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, getSocket, upload, type Author, type Dm, type ReactionEvent } from "../api";
import { MessageReactions } from "../components/Reactions";
import { useMe } from "../App";
import { Avatar } from "../components/Avatar";
import { BackIcon, ImageIcon, LockIcon, SendIcon, TimerIcon } from "../components/Icons";
import { useSectionBack } from "../useSectionBack";
import { DiscreetButton } from "../components/DiscreetScreen";
import { ReportDialog } from "../components/ReportDialog";
import { UNSEND_WINDOW_MS } from "../../../../packages/chat/unsend";
import { SavedPhrasesButton, SavedPhrasesMenu } from "../features/phrases/SavedPhrases";

export function Conversation() {
  const { id = "" } = useParams();
  const { me } = useMe();
  const nav = useNavigate();
  const goBack = useSectionBack("/mensajes");
  const [other, setOther] = useState<Author | null>(null);
  const [messages, setMessages] = useState<Dm[]>([]);
  const [text, setText] = useState("");
  const [phrasesOpen, setPhrasesOpen] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [msgMenu, setMsgMenu] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ src: string; seconds: number; messageId: string } | null>(null);
  const [reporting, setReporting] = useState<Dm | null>(null);
  const [menuTime, setMenuTime] = useState(Date.now);
  const deletedIds = useRef(new Set<string>());
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const expiringNext = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const myId = me?.user.id;

  useEffect(() => {
    let alive = true;
    deletedIds.current.clear();
    const markRead = () =>
      api(`/conversations/${id}/read`, { method: "POST" })
        .then(() => window.dispatchEvent(new Event("mortero:read")))
        .catch(() => {});
    api<{ other: Author }>(`/conversations/${id}`)
      .then((c) => alive && setOther(c.other))
      .catch(() => nav("/mensajes", { replace: true }));
    const loadMessages = () => api<{ messages: Dm[] }>(`/conversations/${id}/messages`).then((d) => {
      if (!alive) return;
      setMessages(d.messages.filter((message) => !deletedIds.current.has(message.id)));
      markRead();
    }).catch(() => { if (alive) setError("No pudimos actualizar el chat. Volvé a abrirlo para reintentar."); });
    void loadMessages();
    const s = getSocket();
    const onMsg = (m: Dm) => {
      if (m.conversationId !== id || deletedIds.current.has(m.id)) return;
      setTyping(false);
      setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
      if (m.senderId !== myId) markRead();
    };
    const onRead = (p: { conversationId: string; readAt: string }) => {
      if (p.conversationId !== id) return;
      setMessages((list) => list.map((m) => (m.senderId === myId && !m.readAt ? { ...m, readAt: p.readAt } : m)));
    };
    const onDeleted = (p: { conversationId: string; id: string }) => {
      if (p.conversationId !== id) return;
      deletedIds.current.add(p.id);
      setMessages((list) => list.filter((m) => m.id !== p.id));
      setViewer((current) => current?.messageId === p.id ? null : current);
    };
    const onOpened = (p: { conversationId: string; id: string }) => {
      if (p.conversationId === id) setMessages((list) => list.map((m) => (m.id === p.id ? { ...m, opened: true } : m)));
    };
    const onTyping = (p: { conversationId: string }) => {
      if (p.conversationId !== id) return;
      setTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(false), 3500);
    };
    const onReaction = (p: ReactionEvent) => {
      if (p.scope !== "dm" || p.conversationId !== id) return;
      setMessages((list) => list.map((m) => (m.id === p.messageId ? { ...m, reactions: p.reactions } : m)));
    };
    s.on("reaction", onReaction);
    s.on("dm:message", onMsg);
    s.on("dm:read", onRead);
    s.on("dm:deleted", onDeleted);
    s.on("dm:opened", onOpened);
    s.on("dm:typing", onTyping);
    s.on("connect", loadMessages);
    return () => {
      alive = false;
      s.off("reaction", onReaction);
      s.off("dm:message", onMsg);
      s.off("dm:read", onRead);
      s.off("dm:deleted", onDeleted);
      s.off("dm:opened", onOpened);
      s.off("dm:typing", onTyping);
      s.off("connect", loadMessages);
      clearTimeout(typingTimer.current);
    };
  }, [id, myId, nav]);

  const menuMessage = messages.find((message) => message.id === msgMenu);
  const deleteDeadline = menuMessage ? new Date(menuMessage.createdAt).getTime() + UNSEND_WINDOW_MS : 0;
  useEffect(() => {
    if (!deleteDeadline) return;
    const timer = setTimeout(() => setMenuTime(Date.now()), Math.max(0, deleteDeadline - Date.now()));
    return () => clearTimeout(timer);
  }, [deleteDeadline]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) list.scrollTop = list.scrollHeight;
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  function onListScroll(event: React.UIEvent<HTMLDivElement>) {
    const list = event.currentTarget;
    stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 2;
  }

  function onType(v: string) {
    setText(v);
    if (v.trim()) getSocket().emit("dm:typing", { conversationId: id });
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError("");
    setText("");
    try {
      const m = await api<Dm>(`/conversations/${id}/messages`, { method: "POST", json: { body } });
      setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
    } catch (err) {
      setText((t) => t || body);
      setError((err as Error).message);
    }
  }

  function pickPhoto(expiring: boolean) {
    expiringNext.current = expiring;
    setPhotoMenu(false);
    fileRef.current?.click();
  }

  async function sendPhoto(file: File) {
    setSending(true);
    setError("");
    try {
      const m = await upload<Dm>(`/conversations/${id}/messages`, file, expiringNext.current ? { expiring: "1" } : {});
      setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function openExpiring(m: Dm) {
    try {
      const r = await api<{ photo: string; seconds: number }>(`/conversations/${id}/messages/${m.id}/open`, { method: "POST" });
      setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, opened: true } : x)));
      if (!deletedIds.current.has(m.id)) setViewer({ src: r.photo, seconds: r.seconds, messageId: m.id });
    } catch (err) {
      setError((err as Error).message);
      setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, opened: true } : x)));
    }
  }

  async function unsend(m: Dm) {
    setMsgMenu(null);
    setError("");
    try {
      await api(`/conversations/${id}/messages/${m.id}`, { method: "DELETE" });
      deletedIds.current.add(m.id);
      setMessages((list) => list.filter((x) => x.id !== m.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const lastMine = [...messages].reverse().find((m) => m.senderId === myId);

  return (
    <div className="chat">
      <header className="topbar topbar--thread">
        <button className="iconbtn" onClick={goBack} aria-label="Volver"><BackIcon /></button>
        {other && (
          <Link to={`/perfil/${other.id}`} className="topbar__who">
            <Avatar src={other.photo} name={other.name} size={36} />
            <span>
              <b>{other.name}</b> <span className="muted">{other.age}</span>
              {typing && <span className="typing-label">escribiendo…</span>}
            </span>
          </Link>
        )}
        <DiscreetButton />
      </header>

      <div className="chat__list chat__list--dm" role="log" aria-label="Mensajes" ref={listRef} onScroll={onListScroll} onClick={() => setMsgMenu(null)}>
        {messages.map((m) => {
          const mine = m.senderId === myId;
          return (
            <div key={m.id} className={`bubble ${mine ? "bubble--mine" : ""} ${m.kind === "album" ? "bubble--album" : ""}`}>
              {m.kind === "album" ? (
                mine ? (
                  <p><LockIcon /> Le compartiste tu álbum privado{m.body ? ` por ${m.body}` : ""}</p>
                ) : (
                  <Link to={`/perfil/${m.senderId}?album=1`} className="album-msg">
                    <LockIcon /> Te invitó a ver su álbum privado{m.body ? ` por ${m.body}` : ""} · <u>Abrir álbum</u>
                  </Link>
                )
              ) : m.expiring ? (
                mine ? (
                  <p className="expiring"><TimerIcon /> Foto temporal · {m.opened ? "ya la vio" : "sin abrir"}</p>
                ) : m.opened ? (
                  <p className="expiring"><TimerIcon /> Foto temporal · ya la viste</p>
                ) : (
                  <button className="expiring expiring--btn" onClick={() => openExpiring(m)}>
                    <TimerIcon /> Foto temporal · tocá para ver
                  </button>
                )
              ) : (
                <>
                  {m.photo && <img className="bubble__photo" src={m.photo} alt="Foto enviada" loading="lazy" />}
                  {m.body && <p>{m.body}</p>}
                </>
              )}
              <time>{new Date(m.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</time>
              {m.kind !== "album" && (
                <MessageReactions scope="dm" messageId={m.id} reactions={m.reactions ?? []} myId={myId} mine={mine}
                  onUpdate={(reactions) => setMessages((list) => list.map((x) => x.id === m.id ? { ...x, reactions } : x))} />
              )}
              {m.kind !== "album" && (
                <>
                  <button
                    className="bubble__more"
                    aria-label="Opciones del mensaje"
                    aria-expanded={msgMenu === m.id}
                    onClick={(e) => { e.stopPropagation(); setMenuTime(Date.now()); setMsgMenu(msgMenu === m.id ? null : m.id); }}
                  >
                    ⋯
                  </button>
                  {msgMenu === m.id && (
                    <div className={`menu menu--bubble ${mine ? "" : "menu--bubble-theirs"}`} role="menu" onClick={(e) => e.stopPropagation()}>
                      {mine ? (
                        menuTime < deleteDeadline
                          ? <button role="menuitem" className="danger" onClick={() => unsend(m)}>Borrar para ambos</button>
                          : <span className="muted small">Pasó el plazo de 2 minutos.</span>
                      ) : <button role="menuitem" onClick={() => { setMsgMenu(null); setReporting(m); }}>Reportar mensaje</button>}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
        {lastMine?.readAt && messages[messages.length - 1]?.id === lastMine.id && <p className="seen">Visto</p>}
        {typing && <div className="bubble typing" aria-label="Está escribiendo"><i /><i /><i /></div>}
      </div>

      {error && <div className="notice notice--error" role="alert">{error}</div>}

      <form className="composer" onSubmit={send}>
        {photoMenu && (
          <div className="photo-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => pickPhoto(false)}><ImageIcon /> Foto</button>
            <button type="button" role="menuitem" onClick={() => pickPhoto(true)}>
              <TimerIcon /> Foto temporal <span className="muted small">se ve una vez, {10} s</span>
            </button>
          </div>
        )}
        {phrasesOpen && (
          <SavedPhrasesMenu text={text} onClose={() => setPhrasesOpen(false)} onPick={(p) => { onType(p); setPhrasesOpen(false); }} />
        )}
        <div className="composer__row">
          <button type="button" className="iconbtn" aria-label="Mandar foto" aria-expanded={photoMenu} disabled={sending} onClick={() => { setPhotoMenu((v) => !v); setPhrasesOpen(false); }}>
            <ImageIcon />
          </button>
          <SavedPhrasesButton open={phrasesOpen} onToggle={() => { setPhrasesOpen((v) => !v); setPhotoMenu(false); }} />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) sendPhoto(f);
              e.target.value = "";
            }}
          />
          <textarea
            className="composer__input"
            aria-label="Mensaje"
            rows={1}
            maxLength={2000}
            placeholder="Escribí un mensaje…"
            value={text}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="sendbtn" aria-label="Mandar" disabled={!text.trim()}><SendIcon /></button>
        </div>
      </form>

      {viewer && <ExpiringViewer src={viewer.src} seconds={viewer.seconds} onClose={() => setViewer(null)} />}
      {reporting && other && <ReportDialog userId={other.id} name={other.name} messageId={reporting.id} messageKind="dm" onClose={() => setReporting(null)} />}
    </div>
  );
}

function ExpiringViewer({ src, seconds, onClose }: { src: string; seconds: number; onClose: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const t = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) onClose();
  }, [left, onClose]);
  return (
    <div className="viewer" role="dialog" aria-modal aria-label="Foto temporal" onClick={onClose}>
      <div className="viewer__bar"><span style={{ width: `${(left / seconds) * 100}%` }} /></div>
      <img src={src} alt="Foto temporal" onContextMenu={(e) => e.preventDefault()} draggable={false} />
      <p className="viewer__note">Se cierra en {Math.max(left, 0)} s y no se puede volver a abrir. Tocá para cerrar.</p>
    </div>
  );
}
