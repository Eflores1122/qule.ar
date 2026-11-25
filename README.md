# qule.ar

**Poné la pava.**

App comunitaria, gratuita y de código abierto para conocer gente cerca y charlar en grupos.

- **Gratis para siempre.** Todo lo que en otras apps es "premium" acá viene incluido.
- **Código abierto** (AGPL-3.0). Cualquiera puede leerlo, proponer cambios y sumarse.
- **Grupos en vez de "explorar".** Hay un chat general para toda la app y grupos a los que pedís entrar.
- **Chat sin acaparadores.** Un sistema de modo lento, cola y rotación hace que siempre aparezca gente nueva.

> Solo para mayores de 18 años. Está en [qule.ar](https://qule.ar).

## Estado

Ya somos **más de 20.000 personas** usando qule.ar. Está en beta y se mejora todos los días, con aportes de la comunidad. Ya funciona:

- **Cuenta y perfil:** registro con email y contraseña o con Google, recuperación de contraseña por mail y verificación de mayor de 18. Perfil con hasta 6 fotos (se les borran los metadatos y la ubicación GPS) y todos los datos: altura, peso, contextura, rol, tribus, qué buscás, relación, pronombres, si tenés lugar, estado serológico y último test.
- **Gente:** grilla de gente cerca, de la más cercana a la más lejana, con estado en línea y filtros. Se puede deslizar de un perfil al siguiente. Se guarda solo una zona de unos 500 m (nunca la posición exacta), la distancia se muestra en tramos para que no se pueda triangular a nadie, y cada persona puede esconder su distancia o borrar su ubicación.
- **Mensajes privados** en tiempo real, con fotos, reacciones, frases guardadas, "escribiendo…" y "visto".
- **Chat general y grupos** con antispam: modo lento, cola con cuenta regresiva, rotación y límites para cuentas nuevas. Cualquiera crea un grupo y queda como dueño. Se entra pidiendo ingreso o aceptando una invitación: nadie queda adentro sin haberlo elegido. Hay roles (dueño, moderador, miembro), solicitudes, expulsiones y reglas antispam configurables por grupo.
- **Todo lo "premium", gratis:**
  - **Modo incógnito:** no aparecés en la grilla, no se ve si estás en línea y tus visitas no se registran.
  - **Quién me vio:** visitas de los últimos 30 días.
  - **Favoritos:** con filtro en la grilla. Nadie se entera de que lo marcaste.
  - **Álbumes privados:** podés tener varios y compartir cada uno con alguien puntual, por un tiempo o sin límite, también desde el chat. Las fotos están protegidas también en el servidor.
  - **Fotos temporales:** se ven una sola vez durante 10 segundos y después se borran del servidor.
  - **Desenviar:** borra el mensaje para las dos personas.
  - Sin publicidad.
- **Cuidado de la comunidad:** bloquear, reportar y borrar tu cuenta con todo lo asociado. Un equipo de moderación con permisos por persona revisa los reportes (agrupados cuando varias personas reportan lo mismo), con alertas automáticas para proteger a menores. Ver [docs/MODERACION.md](docs/MODERACION.md).
- **Notificaciones push discretas:** no dicen quién te escribió ni qué, y cada tipo se puede apagar.
- **Privacidad y seguridad:** los datos de salud se guardan cifrados, y cada cambio al código pasa por pruebas y un análisis de seguridad automático antes de entrar.

Para subirlo a un servidor, seguí [docs/DEPLOY.md](docs/DEPLOY.md). El plan completo está en [docs/PLAN.md](docs/PLAN.md).

## Levantarlo en tu compu

Necesitás Node 22 o más nuevo. No hace falta instalar Postgres: en desarrollo se usa [PGlite](https://pglite.dev), un Postgres embebido que guarda los datos en `data/`.

```bash
npm install
npm run dev
```

Abrí http://localhost:5173. El API corre en el puerto 3001 y Vite le hace de proxy. Para lo opcional (login con Google, mails, etc.), mirá `.env.example`.

Si cambiás la base, editá `apps/api/src/db/schema.ts` y corré `npm run db:generate`. Las migraciones se aplican solas al arrancar el API.

## Cómo sumarte

Es un proyecto comunitario: toda ayuda suma, también si no programás.

- **Ideas y debates** van en [Discusiones](https://github.com/RGabrielR/qule.ar/discussions).
- **Diseño**: leé [docs/LOOK.md](docs/LOOK.md) y proponé en el [hilo de look and feel](https://github.com/RGabrielR/qule.ar/discussions/3).
- **Código**: mirá los issues [`para empezar`](https://github.com/RGabrielR/qule.ar/labels/para%20empezar) y la guía [CONTRIBUTING.md](CONTRIBUTING.md).

## El nombre y el logo

- **El nombre** salió de Twitter y se anunció en [Discusiones](https://github.com/RGabrielR/qule.ar/discussions/11). La app se llama **qule.ar**: el nombre y el dominio son lo mismo. Arrancó como "mortero", y por eso las carpetas, los paquetes y los contenedores todavía se llaman así. Son nombres internos y se pueden cambiar más adelante.
- **El logo** es el mate culo. Salió del [hilo de look and feel](https://github.com/RGabrielR/qule.ar/discussions/3), con la propuesta de @portilloaxel9: un mate de frente con la bombilla, que si lo mirás de nuevo, es una cola. De ese mismo hilo salió el lema, **"Poné la pava."**

## Licencia

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html). Si alguien publica una versión modificada como servicio, también tiene que publicar su código.
