import type { GroupCommunity } from "../api";

const COUNTRIES = { AR: "Argentina", MX: "México" } as const;

export function communityLabel(community: GroupCommunity) {
  return `${community.city}, ${COUNTRIES[community.country]}`;
}

export function GroupCountrySelect(
  { value, onChange, emptyLabel }: {
    value: GroupCommunity["country"] | "";
    onChange: (country: GroupCommunity["country"] | "") => void;
    emptyLabel: string;
  },
) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value as typeof value)}>
      <option value="">{emptyLabel}</option>
      <option value="AR">{COUNTRIES.AR}</option>
      <option value="MX">{COUNTRIES.MX}</option>
    </select>
  );
}

export function GroupCommunityFields(
  { value, onChange }: { value: GroupCommunity | null; onChange: (community: GroupCommunity | null) => void },
) {
  return (
    <>
      <div className="grid2 group-locality">
        <label className="field">
          <span>País del grupo</span>
          <GroupCountrySelect
            value={value?.country ?? ""}
            onChange={(country) => onChange(country ? { country, city: "" } : null)}
            emptyLabel="Sin país"
          />
        </label>
        {value && (
          <label className="field">
            <span>Ciudad del grupo</span>
            <input
              className="input" value={value.city} required minLength={2} maxLength={60}
              onChange={(e) => onChange({ ...value, city: e.target.value })}
            />
          </label>
        )}
      </div>
      {value && <p className="muted small">La ciudad aparece en el directorio de grupos.</p>}
    </>
  );
}
