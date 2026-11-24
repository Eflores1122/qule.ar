import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation } from "react-router";

/**
 * Lo que se estaba viendo en cada pantalla (por dirección: ruta + búsqueda), para volver al mismo lugar
 * al tocar Volver o al cambiar de pestaña y regresar. Vive en memoria: al recargar la app se empieza de cero.
 */
const scrolls = new Map<string, number>();
const counts = new Map<string, number>();

/** Cuántos elementos había cargados en una lista paginada (por ejemplo, "Ver más grupos"). */
export const loadedCount = {
  get: (key: string) => counts.get(key) ?? 0,
  set: (key: string, n: number) => void counts.set(key, n),
};

/**
 * Guarda el scroll de `ref` mientras se mueve y lo devuelve cuando la pantalla tiene su contenido (`ready`).
 * Se devuelve una sola vez por dirección: después manda lo que haga la persona.
 */
export function useRememberScroll(ref: RefObject<HTMLElement | null>, ready: boolean) {
  const { pathname, search } = useLocation();
  const key = pathname + search;
  const restored = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const save = () => scrolls.set(key, el.scrollTop);
    el.addEventListener("scroll", save, { passive: true });
    return () => el.removeEventListener("scroll", save);
  }, [key, ref]);

  useLayoutEffect(() => {
    if (!ready || restored.current === key) return;
    restored.current = key;
    const top = scrolls.get(key);
    if (ref.current && top) ref.current.scrollTop = top;
  }, [ready, key, ref]);
}
