export const REPORT_REASONS = [
  "menor de edad",
  "contenido íntimo sin consentimiento",
  "amenazas o violencia",
  "acoso",
  "suplantación de identidad",
  "perfil falso",
  "spam",
  "venta no permitida",
  "oferta o venta de drogas",
  "robo o estafa",
  "fotos inapropiadas",
  "otro",
] as const;

export const URGENT_REASONS: readonly string[] = REPORT_REASONS.slice(0, 3);
