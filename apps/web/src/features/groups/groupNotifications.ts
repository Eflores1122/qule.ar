import { api } from "../../api";

export function setGroupMuted(groupId: string, muted: boolean) {
  return api<{ muted: boolean }>(`/groups/${groupId}/notifications`, { method: "PUT", json: { muted } });
}
