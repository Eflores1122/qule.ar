# Política de privacidad

**Versión beta · 21 de noviembre de 2026**

En qule.ar tratamos datos muy personales: quién sos, qué buscás y, si lo contás, cosas sobre tu salud. Por eso esta política intenta decir **exactamente** qué guardamos, dónde y quién lo puede ver, sin letra chica. Sigue la **Ley 25.326 de Protección de Datos Personales**.

**qule.ar está en beta.** Leé también los [Términos y condiciones](/terminos). Esta política está en construcción y la vamos a ir completando.

## 1. Quién cuida tus datos

Las personas voluntarias que mantienen qule.ar. El código es abierto: cualquiera puede ver en [GitHub](https://github.com/RGabrielR/qule.ar) qué hace la app con tus datos.

**Contacto:** por ahora, en las [Discusiones del proyecto](https://github.com/RGabrielR/qule.ar/discussions). Para pedidos sobre tus datos, **no publiques nada personal ahí**: dejá un mensaje pidiendo que te contactemos y seguimos por privado. Pronto vamos a sumar un mail.

## 2. Qué datos guardamos

**Para tener una cuenta (obligatorios):**

- Tu mail y un hash de tu contraseña. Usamos ese hash para comprobar tu contraseña al entrar. Si entrás con Google, recibimos tu mail y tu nombre de Google.
- El nombre con el que querés que te vean y tu fecha de nacimiento. Solo mostramos tu edad, nunca la fecha.
- Qué versión de estos términos aceptaste y cuándo.

**Tu perfil (todo opcional, lo completás si querés):**

- Descripción, altura, peso, tipo de cuerpo, posición, tribus, qué buscás, situación sentimental y pronombres.
- **Estado serológico y fecha del último test.** Es un dato de salud: mirá el punto 3.
- Fotos y videos. Al subirlos les borramos los metadatos, incluida la ubicación GPS.

**Tu ubicación:** para mostrarte gente cerca, el navegador redondea tu posición al centro de una zona de unos 500 metros y nos manda solo ese centro. Mientras tenés la app en pantalla, la zona se actualiza cada unos minutos si el navegador consigue una lectura con suficiente precisión. Podés ocultar la distancia o usar el modo incógnito. Si ocultás la distancia, la grilla deja de mostrarla y de usarla para ordenar o filtrar.

**Lo que hacés en la app:**

- Tus mensajes privados y en grupos, las fotos que mandás y tus álbumes privados, con la lista de quién los puede ver.
- Favoritos, bloqueos, reportes y quién vio tu perfil.

**Datos técnicos:**

- La dirección IP y el navegador desde el que entrás, para mantener tu sesión y detectar accesos raros. Se guardan lo que dura la sesión: hasta 7 días sin usar la app, o hasta que cerrás sesión.
- Si activás las notificaciones, un identificador que nos da tu navegador para mandártelas.
- Algunas preferencias quedan guardadas solo en tu dispositivo, como los filtros. No usamos cookies de publicidad ni de seguimiento: la única cookie es la de tu sesión.

## 3. Datos sensibles

Usar qule.ar puede decir algo sobre tu orientación sexual o tu identidad de género, y el estado serológico es un dato de salud. La ley los llama **datos sensibles** y les da protección especial:

- **Nadie está obligado a darlos.** El estado serológico es opcional y lo podés borrar cuando quieras.
- Vos elegís si querés mostrar el género y la orientación que cargaste. Cuando los mostrás, otras personas pueden verlos en tu perfil y usarlos para encontrarte en Gente. Los datos de salud que publicás aparecen en tu perfil.
- Guardamos cifrados el género, la orientación, el estado serológico y la fecha del último test, con una clave separada de la base de datos.
- Nunca los vendemos ni los cedemos, y no los usamos para publicidad.

## 4. Para qué usamos tus datos

Solo para que la app funcione: mostrar tu perfil, la gente cerca y los grupos, mandar tus mensajes, avisarte con notificaciones, mandarte mails de la cuenta (bienvenida o cambio de contraseña), revisar reportes y cuidar la seguridad.

**Cuidado de menores:** qule.ar es solo para mayores de 18. Para detectar a tiempo si entra alguien menor, la app revisa automáticamente los nombres y las descripciones de los perfiles y los grupos, y busca señales como "+14" o "15 años". Si encuentra una, no borra ni oculta nada: manda el caso a moderación para que lo revise una persona.

**No** vendemos datos, **no** mostramos publicidad y **no** armamos perfiles para terceros.

## 5. Dónde están y quién más los ve

**Dónde se guardan:** en un servidor alquilado (VPS) de Contabo, en Europa. El cifrado de campo cubre los datos indicados en el punto 3, el texto de los mensajes privados y el texto de las denuncias. Los demás campos y los archivos dependen de los controles de acceso del servidor.

**Quién los ve:**

- **Otras personas de la app:** ven tu perfil, tus fotos públicas y tu distancia aproximada, si no la ocultaste. Tus álbumes privados los ve solo quien vos elijas.
- **Moderación:** para revisar un reporte, quien modera puede ver el mensaje o el perfil reportado, y la copia que se guarda al reportarlo (mirá el punto 6).
- **Quienes mantienen el servidor:** tienen acceso técnico al servidor y a la clave de cifrado. La app descifra los mensajes privados en el servidor para entregarlos a quienes participan de la charla.
- **Proveedores que usamos para que la app funcione:**
  - **Cloudflare** (Estados Unidos): por ahí pasa el tráfico entre tu celu y el servidor, para que la conexión sea segura y para proteger la app de ataques. Técnicamente, el contenido pasa por sus equipos.
  - **Notificaciones:** las entrega el servicio de tu navegador o teléfono (Google, Apple o Mozilla). Solo reciben un texto genérico como "Tenés un mensaje nuevo", sin nombres ni contenido.
  - **Mails:** si la app te manda mails, los envía un proveedor de correo, que recibe tu dirección y el texto del mail.
  - **Google**, solo si elegís entrar con Google.
- **Autoridades:** solo si una orden judicial nos obliga.

**Transferencia internacional:** el servidor está en Europa (Contabo) y algunos proveedores, en Estados Unidos. Al usar qule.ar aceptás que tus datos se guarden y pasen por esos países, que pueden tener leyes de protección distintas a las nuestras (Ley 25.326, art. 12).

## 6. Cuánto tiempo los guardamos

- Mientras tengas la cuenta.
- **Si borrás tu cuenta**, se borran en el momento tu perfil, fotos, videos, mensajes, favoritos y todo lo asociado, salvo lo que forme parte de un reporte de moderación (mirá abajo). Puede quedar una copia en los backups hasta **14 días**, y después se borra sola.
- **Si desenviás un mensaje privado dentro de los primeros dos minutos**, desaparece de la app para las dos personas. Si el mensaje integra un reporte, el equipo de moderación conserva la copia según las reglas de abajo.
- **Si borrás un mensaje en un grupo**, se borra: deja de verse para todas las personas y el texto se elimina.
- **Las fotos temporales** se borran del servidor después de verse.
- **Si moderación da de baja un grupo**, desaparece para todo el mundo pero queda guardado **90 días** como prueba, y solo lo ve moderación. Después se borra del todo. Lo mismo pasa si su dueño lo borra mientras tiene reportes.
- **Si alguien reporta un mensaje o un perfil**, guardamos una copia de lo reportado (el texto y las fotos) para que moderación lo pueda revisar aunque después se borre.
  - Si moderación **descarta** el reporte, la copia se borra.
  - Si el reporte **terminó en una medida** (borrar el mensaje o suspender la cuenta), la copia se conserva como registro y como prueba, aunque después se borre la cuenta. Solo la ve moderación, y se entrega a una autoridad únicamente si una orden judicial lo pide. La ley permite no borrar datos cuando hacerlo perjudicaría derechos de otras personas o cuando hay obligación de conservarlos (Ley 25.326, art. 16, inc. 5).
- **Si moderación suspende una cuenta**, conservamos una huella del correo generada con una clave del servidor. Permite impedir un nuevo registro con esa dirección aunque se borre la cuenta. La medida termina al levantar la suspensión.

## 7. Cómo los cuidamos

- La conexión siempre va cifrada (HTTPS).
- Las contraseñas se protegen con un hash scrypt y una sal aleatoria para cada una.
- Ciframos los campos sensibles indicados arriba. El servidor necesita la clave para leerlos.
- La base de datos no es accesible desde internet: solo la ve la app.
- Al servidor solo se entra con clave SSH, con bloqueo de intentos fallidos y actualizaciones de seguridad automáticas.
- A las fotos y los videos les borramos los metadatos y la ubicación.
- Las notificaciones no dicen quién te escribió ni qué.

Si pasa algo que afecte tus datos, te vamos a avisar.

## 8. Tus derechos

Según la Ley 25.326, podés:

- **Acceder** a tus datos, o sea, saber qué tenemos sobre vos (art. 14).
- **Rectificarlos** si están mal (art. 16). Casi todo lo podés cambiar vos desde **Yo**.
- **Suprimirlos:** borrar tu cuenta y todo lo asociado (art. 16). Lo podés hacer vos desde **Yo**.
- **Retirar tu consentimiento** cuando quieras, por ejemplo borrando el estado serológico de tu perfil.

Para pedir cualquiera de estas cosas, escribinos (mirá el punto 1). Te respondemos dentro de los plazos de la ley: **10 días corridos** para el acceso y **5 días hábiles** para rectificar o suprimir.

> El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley Nº 25.326. La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley Nº 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.

## 9. Menores de edad

qule.ar es solo para mayores de 18 años. No juntamos datos de menores a propósito. Si nos enteramos de que una cuenta es de una persona menor, la borramos.

## 10. Cambios

Si cambiamos algo importante de esta política, te avisamos en la app y te pedimos que aceptes la versión nueva.
