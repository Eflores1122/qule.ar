/**
 * Frases guardadas para el chat. Se guardan solo en este dispositivo (localStorage), nunca en el servidor.
 * La clave conserva el prefijo "mortero:" como las demás preferencias locales.
 */
const KEY = "mortero:frases";
export const MAX_PHRASES = 20;
export const MAX_PHRASE_LENGTH = 500;

export function loadPhrases(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, MAX_PHRASES) : [];
  } catch {
    return [];
  }
}

export function savePhrases(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_PHRASES)));
  } catch {
    /* sin almacenamiento (modo privado): las frases duran hasta cerrar la pestaña */
  }
}
