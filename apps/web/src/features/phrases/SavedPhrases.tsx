import { useState } from "react";
import { CloseIcon, PhraseIcon } from "../../components/Icons";
import { loadPhrases, MAX_PHRASE_LENGTH, MAX_PHRASES, savePhrases } from "./phrases";

/**
 * Botón del chat para elegir una frase guardada o guardar lo que estás escribiendo.
 * Va en la fila del composer; el menú se abre arriba, como el de mandar fotos.
 */
export function SavedPhrasesButton({ open, onToggle, disabled }: { open: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="iconbtn iconbtn--phrases" aria-label="Frases guardadas" aria-expanded={open} disabled={disabled} onClick={onToggle}>
      <PhraseIcon />
    </button>
  );
}

export function SavedPhrasesMenu({ text, onPick, onClose }: { text: string; onPick: (phrase: string) => void; onClose: () => void }) {
  const [phrases, setPhrases] = useState(loadPhrases);
  const current = text.trim().slice(0, MAX_PHRASE_LENGTH);
  const canSave = current.length > 0 && !phrases.includes(current) && phrases.length < MAX_PHRASES;

  function update(next: string[]) {
    setPhrases(next);
    savePhrases(next);
  }

  return (
    <div className="phrase-menu">
      <div className="phrase-menu__head">
        <p className="small muted">Frases guardadas en este dispositivo</p>
        <button type="button" className="iconbtn" aria-label="Cerrar frases" onClick={onClose}><CloseIcon /></button>
      </div>
      {phrases.length === 0 && <p className="muted small">Todavía no guardaste ninguna. Escribí algo que mandes seguido y guardalo.</p>}
      {phrases.length > 0 && (
        <ul className="phrase-menu__list">
          {phrases.map((p) => (
            <li key={p}>
              <button type="button" className="phrase-menu__pick" onClick={() => onPick(p)}>{p}</button>
              <button type="button" className="iconbtn" aria-label={`Borrar la frase «${p.slice(0, 40)}»`} onClick={() => update(phrases.filter((x) => x !== p))}>
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      {canSave && (
        <button type="button" className="linkbtn" onClick={() => update([current, ...phrases])}>Guardar lo que escribiste</button>
      )}
      {phrases.length >= MAX_PHRASES && <p className="muted small">Llegaste a {MAX_PHRASES} frases. Borrá alguna para guardar otra.</p>}
    </div>
  );
}
