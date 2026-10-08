/**
 * #123 (T15): carpeta de Drive de los archivos de las rutas NUEVAS (`/Por Cobrar/<cliente>/`, `/Por Pagar/<proveedor>/`).
 * No migra rutas ni archivos viejos (las ~8 rutas existentes siguen con su convención por proyecto). Quien sube debe
 * pasar siempre la carpeta raíz por `resolveUploadFolderId` (pruebas de carga).
 */
export type LadoCarpeta = 'cobro' | 'proveedor'

/** Un nombre de contraparte como segmento de carpeta: sin barras ni caracteres de control, con espacios compactos. */
export function segmentoCarpeta(nombre: string | null | undefined): string {
  const limpio = (nombre ?? '')
    .replace(/[\u0000-\u001f/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return limpio === '' ? 'Sin nombre' : limpio
}

export function carpetaContraparte(lado: LadoCarpeta, nombre: string | null | undefined): string {
  return `/${lado === 'cobro' ? 'Por Cobrar' : 'Por Pagar'}/${segmentoCarpeta(nombre)}`
}
