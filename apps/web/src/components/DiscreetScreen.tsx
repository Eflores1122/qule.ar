import { createContext, useContext, type RefObject } from "react";
import { EyeOffIcon } from "./Icons";

export const DiscreetScreenContext = createContext<() => void>(() => {});

export function DiscreetButton() {
  const open = useContext(DiscreetScreenContext);
  return (
    <button
      type="button" className="iconbtn discreet-button" aria-label="Activar pantalla discreta"
      aria-keyshortcuts="Alt+Shift+P" title="Pantalla discreta" onClick={open}
    >
      <EyeOffIcon />
    </button>
  );
}

export function DiscreetScreen({ dialog, onClose }: { dialog: RefObject<HTMLDialogElement | null>; onClose: () => void }) {
  return (
    <dialog
      ref={dialog} className="discreet-screen" aria-labelledby="discreet-title"
      onClose={onClose} onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="discreet-screen__content">
        <h1 id="discreet-title">Pausa</h1>
        <button type="button" className="btn" onClick={() => dialog.current?.close()}>Volver</button>
      </div>
    </dialog>
  );
}
