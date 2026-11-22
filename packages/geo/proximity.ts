export const PROXIMITY_OPTIONS = [5, 20, 50] as const;
export type ProximityLimit = (typeof PROXIMITY_OPTIONS)[number];

export function isProximityLimit(value: number): value is ProximityLimit {
  return PROXIMITY_OPTIONS.some((limit) => limit === value);
}
