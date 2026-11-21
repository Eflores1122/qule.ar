import { useState } from "react";
import { Link } from "react-router";
import { useMe } from "../App";
import { BackIcon } from "../components/Icons";
import { Wordmark } from "../components/Wordmark";
import { COUNTRY_SAFETY_REVIEW, HDT_URL, ILGA_URL, countryGuide, countryOptions, countrySafety } from "../country-safety";

const { featured, nearby, worldwide } = countryOptions();
const reviewDate = new Intl.DateTimeFormat("es", { dateStyle: "long", timeZone: "UTC" }).format(new Date(COUNTRY_SAFETY_REVIEW));

export function CountrySafety() {
  const { me } = useMe();
  const [code, setCode] = useState("");
  const status = code ? countrySafety(code) : null;
  const guide = countryGuide(code);
  const back = me ? "/cerca" : "/entrar";

  return (
    <main className="legal country-safety">
      <header className="legal__top">
        <Link className="iconbtn" to={back} aria-label="Volver"><BackIcon /></Link>
        <Wordmark />
      </header>
      <section className="legal__body" aria-labelledby="country-safety-title">
        <h1 id="country-safety-title">Avisos de seguridad por país</h1>
        <p>Consultá las leyes y los avisos locales antes de viajar, encontrarte con alguien o compartir tu ubicación.</p>
        <div className="field">
          <label htmlFor="safety-country">País o territorio</label>
          <select id="safety-country" className="input" value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="">Seleccioná un país o territorio</option>
            <optgroup label="Argentina y México">
              {featured.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
            </optgroup>
            <optgroup label="Resto de Latinoamérica y el Caribe">
              {nearby.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
            </optgroup>
            <optgroup label="Resto del mundo">
              {worldwide.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
            </optgroup>
          </select>
        </div>
        <div aria-live="polite" aria-atomic>
          {status === "guide" && guide && (
            <section className="country-safety__result">
              <h2>{guide.name}</h2>
              <p>Las relaciones sexuales consensuadas entre personas adultas del mismo sexo no están penalizadas. {guide.note}</p>
            </section>
          )}
          {status === "flagged" && (
            <section className="country-safety__result country-safety__result--alert">
              <h2>Aviso de criminalización</h2>
              <p>El mapa de Human Dignity Trust incluye esta jurisdicción. Las leyes y su aplicación pueden variar según el territorio. Consultá la ficha actualizada antes de compartir datos personales o reunirte con alguien.</p>
            </section>
          )}
          {status === "check-sources" && (
            <section className="country-safety__result">
              <h2>Consultá las fuentes actualizadas</h2>
              <p>Verificá las leyes y los riesgos locales en las fuentes de abajo. La ausencia de un aviso no garantiza seguridad.</p>
            </section>
          )}
          {status === "needs-review" && (
            <section className="country-safety__result country-safety__result--alert">
              <h2>Información pendiente de revisión</h2>
              <p>Consultá las fuentes directamente para conocer la situación actual.</p>
            </section>
          )}
        </div>
        <ul>
          {guide?.sources.map(({ label, url }) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{label}</a></li>)}
          <li><a href={ILGA_URL} target="_blank" rel="noreferrer">Base de datos de ILGA Mundo</a></li>
          <li><a href={HDT_URL} target="_blank" rel="noreferrer">Mapa de Human Dignity Trust</a></li>
        </ul>
        <p className="muted small">Fuentes revisadas el <time dateTime={COUNTRY_SAFETY_REVIEW}>{reviewDate}</time>. La consulta se hace en este dispositivo.</p>
      </section>
    </main>
  );
}
