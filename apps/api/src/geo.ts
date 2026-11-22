/**
 * Privacidad de ubicación.
 *
 * 1. La posición exacta nunca se guarda: se redondea al centro de una celda de ~500 m.
 * 2. La distancia se calcula entre centros de celda. La interfaz, el filtro y el orden
 *    usan los mismos tramos aproximados ("a menos de 1 km", "3 km", "15 km").
 */

export { snapToCell } from "../../../packages/geo/cell.js";

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

type Located = { cellLat: number | null; cellLng: number | null; showDistance: boolean };

/**
 * Distancia entre dos personas, solo si las dos tienen ubicación y ninguna la escondió. Si alguna la escondió,
 * es null para todo: no se muestra, pero tampoco se usa para ordenar ni para filtrar. Si se usara para ordenar
 * ("más cerca primero"), cualquiera podría ubicar igual a quien la escondió moviendo su propia ubicación.
 */
export function visibleKm(me: Located, other: Located): number | null {
  if (!me.showDistance || !other.showDistance) return null;
  if (me.cellLat == null || me.cellLng == null || other.cellLat == null || other.cellLng == null) return null;
  return distanceKm(me.cellLat, me.cellLng, other.cellLat, other.cellLng);
}

/** Tramo de distancia que se muestra. Nunca el número exacto. */
export function distanceBand(km: number): number {
  if (km < 1) return 0;
  if (km < 10) return Math.round(km);
  if (km < 100) return Math.round(km / 5) * 5;
  return 101;
}

export function distanceLabel(km: number): string {
  const band = distanceBand(km);
  if (band === 0) return "a menos de 1 km";
  if (band > 100) return "más de 100 km";
  return `${band} km`;
}

/** Caja de búsqueda alrededor de un punto. */
export function boundingBox(lat: number, lng: number, km: number) {
  const radians = Math.PI / 180;
  const angle = km / 6371;
  const dLat = angle / radians;
  const minLat = Math.max(-90, lat - dLat);
  const maxLat = Math.min(90, lat + dLat);
  if (minLat === -90 || maxLat === 90) return { minLat, maxLat, minLng: -180, maxLng: 180 };
  const dLng = Math.asin(Math.sin(angle) / Math.cos(lat * radians)) / radians;
  return { minLat, maxLat, minLng: lng - dLng, maxLng: lng + dLng };
}
