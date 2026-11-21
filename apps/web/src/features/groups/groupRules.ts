import type { SpamRules } from "../../api";

export function slowModeText({ burst, intervalSeconds }: SpamRules) {
  const windowSecs = burst * intervalSeconds;
  const interval = windowSecs < 60 ? `${windowSecs} s` : `${Math.round((windowSecs / 60) * 10) / 10} min`;
  return `Modo lento · ${burst} ${burst === 1 ? "mensaje" : "mensajes"} cada ${interval}`;
}
