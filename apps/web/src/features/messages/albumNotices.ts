import { useEffect, useState } from "react";
import type { Dm } from "../../api";

export function albumNoticeKind(message: Dm, now: number) {
  if (message.kind !== "album" || !message.expiresAt) return message.kind;
  return Date.parse(message.expiresAt) > now ? "album" : "album_expired";
}

export function albumExpiryLabel(message: Dm, now: number) {
  if (albumNoticeKind(message, now) === "album_expired") return "Vencido";
  if (!message.expiresAt) return "";
  const minutes = Math.max(1, Math.floor((Date.parse(message.expiresAt) - now) / 60_000));
  if (minutes < 60) return `Vence en ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `Vence en ${hours} h`;
  return `Vence en ${Math.floor(hours / 24)} días`;
}

export function useAlbumNoticeTime(messages: readonly Dm[]) {
  const [time, setTime] = useState(Date.now);
  const now = Math.max(time, Date.now());
  let next = Infinity;
  for (const message of messages) {
    if (message.kind !== "album" || !message.expiresAt) continue;
    const left = Date.parse(message.expiresAt) - now;
    if (left > 0) next = Math.min(next, now + Math.min(left, left % 60_000 + 1));
  }
  useEffect(() => {
    if (!Number.isFinite(next)) return;
    const refresh = () => setTime(Date.now());
    const timer = setTimeout(refresh, Math.max(0, next - Date.now()));
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [next]);
  return now;
}
