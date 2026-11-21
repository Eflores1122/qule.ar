import mate from "../../brand/icono.svg";

/**
 * La imagen de un grupo: su foto si el dueño puso una, la inicial si no.
 * El chat general muestra el mate culo, el logo de la app.
 */
export function GroupAvatar({ name, photo, general = false, size }: {
  name: string;
  photo?: string | null;
  general?: boolean;
  size?: "sm" | "big";
}) {
  const cls = `gcard__icon${size ? ` gcard__icon--${size}` : ""}`;
  if (general) {
    return (
      <span className={`${cls} gcard__icon--logo`} aria-hidden>
        <img src={mate} alt="" />
      </span>
    );
  }
  if (photo) return <img className={`${cls} gcard__icon--photo`} src={photo} alt="" loading="lazy" />;
  return <span className={cls} aria-hidden>{name.trim().charAt(0).toUpperCase()}</span>;
}
