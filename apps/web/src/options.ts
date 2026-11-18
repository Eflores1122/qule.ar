// Opciones del perfil. Son texto libre en la base: cualquiera puede proponer agregar o cambiar opciones.

export const BODY_TYPES = ["Delgado", "Promedio", "Atlético", "Musculoso", "Robusto", "Grande"];
export const POSITIONS = ["Activo", "Versátil activo", "Versátil", "Versátil pasivo", "Pasivo", "Side"];
export const TRIBES = [
  "Oso", "Nutria", "Lobo", "Chaser", "Twink", "Maduro", "Deportista", "Geek",
  "Cuero", "Discreto", "Trans", "Poz", "No binarie", "Drag",
];
export const LOOKING_FOR = ["Charlar", "Amistad", "Citas", "Pareja", "Contactos", "Ahora", "Networking"];
export const RELATIONSHIP = ["Soltero", "Saliendo con alguien", "En pareja", "Relación abierta", "Casado", "Es complicado"];
export const PRONOUNS = ["él", "elle", "ella", "él/elle", "ella/elle"];
export const HIV_STATUS = [
  "Negativo", "Negativo, con PrEP", "Positivo", "Positivo, indetectable", "Prefiero no decir",
];
export const REPORT_REASONS = ["spam", "acoso", "menor de edad", "fotos inapropiadas", "perfil falso", "otro"] as const;
