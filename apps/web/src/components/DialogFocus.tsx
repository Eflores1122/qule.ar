import { useEffect, useRef } from "react";

/**
 * Va como primer hijo de una hoja (role="dialog"). Al abrirse le pasa el foco (así el lector de pantalla la anuncia
 * y el teclado queda adentro), Escape la cierra, y al cerrarse devuelve el foco a donde estaba.
 */
export function DialogFocus({ onClose }: { onClose: () => void }) {
  const marker = useRef<HTMLSpanElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const dialog = marker.current?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.contains(document.activeElement)) {
      if (!dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
      dialog.focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return <span ref={marker} hidden />;
}
