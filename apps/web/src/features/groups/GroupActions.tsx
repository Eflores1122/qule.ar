import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import type { GroupInfo } from "../../api";
import { DotsIcon } from "../../components/Icons";

export function GroupActions({ group }: { group: GroupInfo }) {
  const [open, setOpen] = useState(false);
  const actionsId = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const infoPath = `/grupos/${group.id}/info`;
  const pending = group.pendingCount;

  useEffect(() => {
    if (!open) return;

    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div
      className="group-actions"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        type="button"
        className="iconbtn iconbtn--badge"
        ref={trigger}
        aria-label={`Opciones del grupo${pending ? `, ${pending} ${pending === 1 ? "solicitud pendiente" : "solicitudes pendientes"}` : ""}`}
        aria-expanded={open}
        aria-controls={actionsId}
        onClick={() => setOpen(!open)}
      >
        <DotsIcon />
        {pending > 0 && <b className="badge" aria-hidden="true">{pending}</b>}
      </button>
      <div className="menu group-actions__menu" id={actionsId} hidden={!open}>
        <Link to={infoPath} onClick={() => setOpen(false)}>Ver detalles</Link>
      </div>
    </div>
  );
}
