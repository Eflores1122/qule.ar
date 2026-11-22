# Checklist de staging

Probá la versión integrada que se propone desplegar, con una cuenta y fotos de prueba. `npm run check` y una prueba aislada del conversor no reemplazan el recorrido en el teléfono.

## Fotos: selector, preparación, recorte y subida

Repetí esta checklist cuando cambie el selector de fotos, la conversión HEIC/HEIF, el recortador o su integración con el editor de perfil. Antecedentes: [issue #83](https://github.com/RGabrielR/qule.ar/issues/83) y [PR #84](https://github.com/RGabrielR/qule.ar/pull/84).

Hacé el recorrido completo en **Fotos del perfil** y en **Álbum privado**, desde el mismo teléfono y por la URL HTTPS de staging (por ejemplo, el túnel de prueba):

- [ ] Elegí una HEIC/HEIF real desde el selector nativo de **Google Fotos**, usando el archivo original. Si viene de la nube, probá también ese origen. Adjuntar una HEIC local desde la compu no cubre este caso.
- [ ] Mientras se lee y convierte, aparece «Preparando foto…» con un indicador en la grilla correspondiente. El recortador abre recién cuando la imagen está lista y se ve correctamente.
- [ ] Mové la imagen, ajustá el zoom, confirmá el recorte y subila. Recargá y abrí la foto para comprobar que quedó guardada con el recorte elegido.
- [ ] Probá también un JPEG común y un JPEG cuyos bytes sean JPEG pero conserve nombre o MIME HEIC, como puede entregar el selector. Ambos llegan al recorte y se suben.
- [ ] Elegí una tanda con JPEG y HEIC. Se respeta el orden, cada foto tiene su recorte y omitir una permite seguir con la siguiente.
- [ ] Incluí un archivo ilegible entre dos fotos válidas. Se muestra un aviso de error durante unos cinco segundos y la tanda continúa; no queda un indicador permanente ni se bloquea el editor. Si el siguiente recorte ya abrió, el aviso sigue siendo visible.
- [ ] En el álbum privado, probá una tanda con fotos y video: las fotos pasan por el recortador, el video sigue su recorrido y se conserva el orden.
- [ ] Revisá el indicador y los avisos a 375 px, en Oscuro y Penumbra, y con reducción de movimiento activada.

## Dejar constancia en el PR

Copiá esta ficha en «Cómo lo probé». Marcá **pendiente** lo que no se probó; no des por cubierta la selección desde Google Fotos con una simulación de escritorio.

```text
Versión/commit probado y URL de staging:
Teléfono, sistema operativo y navegador (versiones):
Modo: navegador / app instalada:
Origen: Google Fotos local / nube / archivos del dispositivo:
Archivo: HEIC real / JPEG / JPEG etiquetado como HEIC:
Destino: perfil / álbum privado:
Resultado: preparación → recorte → subida → recarga:
Tanda, error y continuación:
Pruebas simuladas (por ejemplo, demora o fallo de lectura):
Pendientes y fallos encontrados:
```

Usá imágenes sin datos personales para la evidencia pública. No adjuntes fotos privadas, credenciales ni enlaces de acceso a cuentas de prueba.
