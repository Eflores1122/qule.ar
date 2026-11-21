export const ILGA_URL = "https://database.ilga.org/criminalizacion-actos-sexuales-consensuales";
export const HDT_URL = "https://www.humandignitytrust.org/lgbt-the-law/map-of-criminalisation/";
export const COUNTRY_SAFETY_REVIEW = "2026-11-21";

const featuredGuides = [
  {
    code: "AR",
    name: "Argentina",
    note: "Si sufrís discriminación, podés consultar la normativa argentina y los recursos oficiales.",
    sources: [
      { label: "Ley argentina contra actos discriminatorios", url: "https://www.argentina.gob.ar/normativa/nacional/ley-23592-20465/texto" },
      { label: "Información de viaje para Argentina", url: "https://travel.state.gov/en/international-travel/travel-advisories/argentina.html" },
    ],
  },
  {
    code: "MX",
    name: "México",
    note: "Las personas LGBT+ pueden enfrentar discriminación. Consultá los avisos locales antes de viajar.",
    sources: [
      { label: "Avisos para México del Gobierno de Canadá", url: "https://travel.gc.ca/destinations/mexico" },
    ],
  },
];

export function countryGuide(code: string) {
  return featuredGuides.find((guide) => guide.code === code);
}

// Jurisdicciones incluidas en la vista de criminalización de Human Dignity Trust al revisar las fuentes.
// El mapa distingue la letra de la ley, su aplicación y las diferencias dentro de algunas jurisdicciones.
const flaggedCountries = new Set([
  "AF", "BD", "BN", "ID", "IR", "IQ", "KW", "LB", "MY", "MV", "MM", "OM", "PK", "PS", "QA", "SA", "LK", "SY", "TM", "AE", "UZ", "YE",
  "DZ", "BF", "BI", "CM", "TD", "KM", "EG", "ER", "SZ", "ET", "GH", "GN", "KE", "LR", "LY", "MW", "ML", "MR", "MA", "NE", "NG",
  "SN", "SL", "SO", "SS", "SD", "TZ", "GM", "TG", "TN", "UG", "ZM", "ZW",
  "GD", "GY", "JM", "VC", "TT", "KI", "PG", "WS", "SB", "TO", "TV",
]);

const latinAmerica = new Set([
  "AG", "BB", "BO", "BR", "BS", "BZ", "CL", "CO", "CR", "CU", "DM", "DO", "EC", "GD", "GP", "GT", "GY", "HN", "HT",
  "JM", "KN", "LC", "MQ", "NI", "PA", "PE", "PR", "PY", "SR", "SV", "TT", "UY", "VC", "VE",
]);

const regionNames = new Intl.DisplayNames(["es"], { type: "region", fallback: "none" });
const byName = new Intl.Collator("es");
const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const nonCountryCodes = new Set(["EA", "EU", "EZ", "QO", "UN", "ZZ"]);

export function countryOptions() {
  const nearby: Array<{ code: string; name: string }> = [];
  const worldwide: typeof nearby = [];
  for (const a of letters) {
    for (const b of letters) {
      const code = a + b;
      if (nonCountryCodes.has(code) || countryGuide(code)) continue;
      const name = regionNames.of(code);
      if (name) (latinAmerica.has(code) ? nearby : worldwide).push({ code, name });
    }
  }
  nearby.sort((a, b) => byName.compare(a.name, b.name));
  worldwide.sort((a, b) => byName.compare(a.name, b.name));
  return { featured: featuredGuides.map(({ code, name }) => ({ code, name })), nearby, worldwide };
}

export function countrySafety(code: string, now = Date.now()) {
  const reviewedAt = Date.parse(COUNTRY_SAFETY_REVIEW);
  if (now - reviewedAt >= 90 * 86_400_000) return "needs-review";
  if (countryGuide(code)) return "guide";
  return flaggedCountries.has(code) ? "flagged" : "check-sources";
}
