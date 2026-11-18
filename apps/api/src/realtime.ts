import type { Server as HttpServer } from "node:http";
import { and, eq, lte } from "drizzle-orm";
import { Server } from "socket.io";
import { auth } from "./auth.js";
import { db, schema } from "./db/index.js";
import { authorsFor, blockedWith } from "./lib.js";

const { groupMember, groupMessage } = schema;

let io: Server | null = null;

/** Quién tiene la app abierta ahora (cantidad de pestañas o dispositivos conectados). */
const online = new Map<string, number>();
export const isOnline = (userId: string) => online.has(userId);

function touchLastSeen(userId: string) {
  db.update(schema.profile)
    .set({ lastSeenAt: new Date() })
    .where(eq(schema.profile.userId, userId))
    .catch(() => {});
}

export const userRoom = (id: string) => `user:${id}`;
export const groupRoom = (id: string) => `group:${id}`;

/** El socket solo recibe: todo lo que se manda pasa por la API HTTP. */
export function attachRealtime(server: HttpServer) {
  io = new Server(server, { path: "/socket.io" });

  io.use(async (socket, next) => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(socket.handshake.headers)) {
      if (typeof v === "string") headers.set(k, v);
    }
    const s = await auth.api.getSession({ headers });
    if (!s) return next(new Error("sin sesión"));
    const [p] = await db.select({ suspendedAt: schema.profile.suspendedAt }).from(schema.profile)
      .where(eq(schema.profile.userId, s.user.id));
    if (p?.suspendedAt) return next(new Error("cuenta suspendida"));
    socket.data.userId = s.user.id;
    next();
  });

  io.on("connection", async (socket) => {
    const userId: string = socket.data.userId;
    socket.join(userRoom(userId));
    online.set(userId, (online.get(userId) ?? 0) + 1);
    touchLastSeen(userId);
    // "Escribiendo…": lo único que el socket acepta del cliente. Se verifica que sea parte de la charla.
    const convOther = new Map<string, string | null>();
    let lastTyping = 0;
    socket.on("dm:typing", async (p: unknown) => {
      const conversationId = typeof p === "object" && p && "conversationId" in p ? String((p as { conversationId: unknown }).conversationId) : "";
      if (!conversationId || Date.now() - lastTyping < 1000) return;
      lastTyping = Date.now();
      if (!convOther.has(conversationId)) {
        const [conv] = await db.select().from(schema.conversation).where(eq(schema.conversation.id, conversationId));
        const other = conv && (conv.userA === userId ? conv.userB : conv.userB === userId ? conv.userA : null);
        convOther.set(conversationId, other ?? null);
      }
      const other = convOther.get(conversationId);
      if (other) io?.to(userRoom(other)).emit("dm:typing", { conversationId });
    });
    socket.on("disconnect", () => {
      const n = (online.get(userId) ?? 1) - 1;
      if (n <= 0) online.delete(userId);
      else online.set(userId, n);
      touchLastSeen(userId);
    });
    const groups = await db.select().from(groupMember).where(eq(groupMember.userId, userId));
    for (const g of groups) socket.join(groupRoom(g.groupId));
  });

  setInterval(() => publishDue().catch((e) => console.error("publishDue", e)), 1000);
}

/** Hace que todos los sockets de un usuario entren a (o salgan de) la sala de un grupo. */
export function syncGroupRoom(userId: string, groupId: string, join: boolean) {
  if (!io) return;
  if (join) io.in(userRoom(userId)).socketsJoin(groupRoom(groupId));
  else io.in(userRoom(userId)).socketsLeave(groupRoom(groupId));
}

/** Corta todas las conexiones en vivo de alguien (por ejemplo, al suspenderlo). */
export function disconnectUser(userId: string) {
  io?.in(userRoom(userId)).disconnectSockets(true);
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(userRoom(userId)).emit(event, payload);
}

/** Manda un evento a un grupo, salteando a quienes tienen un bloqueo con el autor. */
export async function emitToGroup(groupId: string, authorId: string, event: string, payload: unknown) {
  if (!io) return;
  const blocked = [...(await blockedWith(authorId))].map(userRoom);
  io.to(groupRoom(groupId)).except(blocked).emit(event, payload);
}

export async function serializeGroupMessages(rows: (typeof groupMessage.$inferSelect)[]) {
  const authors = await authorsFor(rows.map((r) => r.userId));
  return rows.map((r) => ({
    id: r.id,
    groupId: r.groupId,
    body: r.status === "deleted" ? null : r.body,
    status: r.status,
    scheduledAt: r.scheduledAt.toISOString(),
    author: authors.get(r.userId) ?? { id: r.userId, name: "Cuenta borrada", age: 0, photo: null },
  }));
}

/** Publica los mensajes en cola a los que ya les tocó salir. */
async function publishDue() {
  const due = await db
    .update(groupMessage)
    .set({ status: "published" })
    .where(and(eq(groupMessage.status, "queued"), lte(groupMessage.scheduledAt, new Date())))
    .returning();
  if (!due.length) return;
  const out = await serializeGroupMessages(due);
  for (const m of out) {
    await emitToGroup(m.groupId, m.author.id, "group:message", m);
  }
}
