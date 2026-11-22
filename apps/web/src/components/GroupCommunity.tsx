import type { GroupCommunity } from "../api";
import { GROUP_TOPICS } from "../options";

const COUNTRIES = { AR: "Argentina", MX: "México" } as const;

export function communityLabel(community: GroupCommunity) {
  return [community.city, community.municipality, COUNTRIES[community.country]].filter(Boolean).join(", ");
}

export function GroupTopicSelect({ value, onChange, emptyLabel }: { value: string; onChange: (topic: string) => void; emptyLabel: string }) {
  return (
    <label className="field">
      <span>Interés del grupo</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{emptyLabel}</option>
        {GROUP_TOPICS.map((topic) => <option key={topic}>{topic}</option>)}
      </select>
    </label>
  );
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
      {value && (
        <label className="field">
          <span>Municipio o localidad (opcional)</span>
          <input className="input" value={value.municipality ?? ""} maxLength={60}
            onChange={(e) => onChange({ ...value, municipality: e.target.value })} />
        </label>
      )}
      {value && <p className="muted small">La ubicación del grupo aparece en el directorio.</p>}
    </>
  );
}
