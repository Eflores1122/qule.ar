export const POSITIONS = ["Activo", "Versátil activo", "Versátil", "Versátil pasivo", "Pasivo", "Side"] as const;
export const GENDERS = ["Hombre", "Hombre trans", "Mujer", "Mujer trans", "No binarie", "Género fluido", "Agénero", "Otra identidad"] as const;
export const ORIENTATIONS = ["Gay", "Lesbiana", "Bisexual", "Pansexual", "Queer", "Asexual", "Demisexual", "Heterosexual", "Otra orientación"] as const;
export const LOOKING_FOR = ["Charlar", "Amistad", "Citas", "Pareja", "Sexo casual", "Sin compromiso", "Abierto a lo que surja", "Contactos", "Ahora", "Networking"] as const;
export const GROUP_TOPICS = ["Amistad", "Videojuegos", "Gimnasio", "Deportes", "Cultura", "Salidas", "Apoyo comunitario", "Otros intereses"] as const;

export function searchText(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");
}

export function expandPositions(wanted: string[]) {
  return wanted.includes("Versátil") ? [...new Set([...wanted, "Versátil activo", "Versátil pasivo"])] : wanted;
}
