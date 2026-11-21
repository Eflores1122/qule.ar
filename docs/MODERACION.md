# Protocolo de moderación

Qué hacer con cada reporte, en cuánto tiempo y cuándo avisar a las autoridades. Es para las personas que moderan qule.ar.

> Esto no es asesoramiento legal. Ante un caso grave o con dudas, consultá con alguien que sepa de derecho.

## Por qué importa

En Argentina, una plataforma no responde por lo que publican otras personas **mientras no se entere**. Cuando le llega un aviso de algo claramente ilegal y no actúa, empieza a responder (Corte Suprema, "Rodríguez c/ Google", 2014). Un reporte es ese aviso. **Revisar los reportes rápido es lo que protege a quien usa la app, y también al proyecto.**

## Antes de empezar

- **Tiene que haber al menos dos personas moderando**, configuradas en `ADMIN_USER_IDS` (ver `docs/DEPLOY.md`), con las notificaciones activadas en la app. Si nadie modera, los reportes se acumulan sin que nadie los vea.
- Ante un reporte urgente, la app les manda una notificación a todas ("Hay un reporte urgente para revisar").
- El panel está en **Yo → Moderación** y muestra primero lo urgente.

## Prioridades

| Prioridad | Motivo del reporte | Tiempo para revisarlo |
|---|---|---|
| **Urgente** | Menor de edad · Contenido íntimo sin consentimiento · Amenazas o violencia | **Dentro de las 24 h**, idealmente en pocas horas |
| Normal | Acoso · Fotos inapropiadas · Perfil falso · Spam · Otro | Dentro de las 72 h |

**Ocultamiento por precaución.** Si un perfil recibe reportes urgentes de **3 personas distintas** que todavía nadie revisó, deja de aparecer en "Cerca" y en las listas para invitar a grupos. No es una suspensión: la cuenta sigue funcionando. Vuelve a aparecer cuando moderación cierra esos reportes. Así se limita el daño si nadie llega a revisarlo enseguida.

## Qué hacer en cada caso

### Menor de edad
1. Si hay indicios razonables (lo dice el perfil, las fotos, los mensajes), **suspendé la cuenta**. El motivo queda registrado.
2. Si además hay contenido sexual de una persona menor o alguien adulto intentando contactarla con fines sexuales (*grooming*, art. 131 del Código Penal), seguí el caso de abajo.

### Contenido sexual de menores (el caso más grave)
1. **No descargues, no reenvíes y no hagas capturas del contenido.** Tenerlo o pasarlo es delito (art. 128 del Código Penal), aunque sea para denunciarlo.
2. **Suspendé la cuenta** enseguida. Así deja de estar visible.
3. **No borres el mensaje ni la cuenta.** Hace falta como prueba.
4. **Denuncialo** ante el Ministerio Público Fiscal (la Unidad Fiscal Especializada en Ciberdelincuencia, UFECI) o en la policía. Indicá el ID de la cuenta y la fecha, y avisá a quien administra el servidor para que preserve los datos.
5. Seguí las indicaciones de la fiscalía.

### Contenido íntimo sin consentimiento
Fotos o videos íntimos de alguien compartidos sin su permiso. La Ley 27.736 ("Ley Olimpia") lo reconoce como violencia digital.
1. **Borrá el mensaje** desde el reporte ("Borrar mensaje") y **suspendé la cuenta** de quien lo compartió.
2. Si la persona afectada lo pide, ayudala con lo que pueda necesitar para denunciar. La línea 144 (violencia de género) orienta las 24 h.

### Amenazas o violencia
1. Si hay una amenaza concreta contra alguien, **suspendé la cuenta**.
2. Si hay riesgo inmediato, la persona tiene que llamar al **911**. La app no reemplaza eso.

### Acoso, fotos inapropiadas, perfil falso, spam, otro
- Primera vez y leve: descartá el reporte o borrá el mensaje, según el caso.
- Si se repite (el panel muestra cuántos reportes tiene la cuenta en total) o es grave: suspendé.
- Ante la duda, mirá el [Código de conducta](../CODE_OF_CONDUCT.md).

## Reglas para quien modera

- **Mirá solo lo necesario** para resolver el reporte: el mensaje o el perfil reportado. Nada más. Son datos personales, y muchas veces sensibles (Ley 25.326).
- **No compartas** fuera del equipo de moderación nada de lo que ves en un reporte.
- **Escribí siempre el motivo** al suspender. Queda registrado y es lo que ve la persona suspendida.
- **Cuidado con los reportes falsos.** Si muchas cuentas nuevas reportan a la misma persona sin motivo, puede ser un ataque. Descartá esos reportes y, si hace falta, suspendé a quienes los mandan.
- **Si te equivocaste**, la suspensión se puede levantar desde la pestaña Suspendidas.

## Pendiente

- **Guardar una copia del mensaje reportado** al momento del reporte. Hoy, si quien lo escribió lo borra antes de que se revise, moderación ya no lo ve.
- **Un canal privado de contacto**, por mail, para quien quiere apelar una suspensión o pedir ayuda. Depende del servicio de mails (discusión #25).
- **Mirar este protocolo cada tanto** y ajustarlo con lo que vaya pasando.
