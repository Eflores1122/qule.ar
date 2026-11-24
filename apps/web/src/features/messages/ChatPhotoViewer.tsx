import { useLayoutEffect, useRef } from "react";
import { CloseIcon } from "../../components/Icons";

export function ChatPhotoViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} className="lightbox chat-photo-viewer" aria-label="Foto del chat" onClose={onClose}>
      <header className="lightbox__bar">
        <span>Foto del chat</span>
        <button type="button" className="iconbtn" aria-label="Cerrar foto" onClick={() => dialogRef.current?.close()}>
          <CloseIcon />
        </button>
      </header>
      <div className="lightbox__stage">
        <div className="lightbox__slide">
          <img src={src} alt="Foto del chat" />
        </div>
      </div>
    </dialog>
  );
}
