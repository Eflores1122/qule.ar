/**
 * Prepara una foto antes de subirla: controla el peso y convierte HEIC/HEIF (iPhone y algunos Android) a JPG en el navegador.
 * La usan el perfil, el álbum y la foto de grupo.
 */

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

function isHeicPhoto(file: File, bytes: ArrayBuffer): boolean {
  // Algunos selectores omiten el MIME o cambian la extensión. Reconocemos también la marca del contenedor.
  const header = new TextDecoder().decode(bytes.slice(4, 12));
  return /^ftyp(?:hei[cxms]|hev[cxms]|mif1|msf1)$/.test(header)
    || /^image\/hei[cf](?:-sequence)?$/i.test(file.type)
    || /\.hei[cf]$/i.test(file.name);
}

export async function preparePhotoForUpload(file: File): Promise<File> {
  if (file.size > MAX_PHOTO_BYTES) throw new Error("La foto pesa demasiado (máx. 12 MB)");
  // El selector puede entregar un archivo respaldado por un proveedor de fotos en la nube.
  // Leemos sus bytes antes de que el navegador intente enviarlo como parte del formulario.
  const bytes = await file.arrayBuffer().catch(() => null);
  if (!bytes?.byteLength) throw new Error("No pudimos abrir la foto. Descargala al dispositivo y volvé a elegirla.");
  const readable = new File([bytes], file.name, { type: file.type });
  if (!isHeicPhoto(file, bytes)) return readable;

  let jpeg: Blob;
  try {
    const { heicTo } = await import("heic-to/csp");
    jpeg = await heicTo({ blob: readable, type: "image/jpeg", quality: 0.85 });
    if (!jpeg.size || jpeg.type !== "image/jpeg") throw new Error("JPEG inválido");
  } catch {
    throw new Error("No pudimos convertir la foto a JPG. Probá guardarla como JPG y volvé a elegirla.");
  }
  if (jpeg.size > MAX_PHOTO_BYTES) throw new Error("La foto convertida pesa demasiado (máx. 12 MB)");
  return new File([jpeg], `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`, { type: jpeg.type });
}
