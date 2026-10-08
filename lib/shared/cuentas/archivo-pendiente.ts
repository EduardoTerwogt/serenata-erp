/**
 * #131: los datos de una factura se guardan antes de subir sus archivos a Drive. Mientras un archivo no llega a Drive,
 * `archivo_url` (NOT NULL) lleva `pendiente:xml` o `pendiente:pdf` y la pantalla muestra "Archivo pendiente" en lugar
 * de un enlace; al subirlo (en el momento o con "Reintentar subida") pasa a ser el enlace de Drive.
 */
export type RolArchivo = 'xml' | 'pdf'

const PREFIJO = 'pendiente:'

export const urlPendiente = (rol: RolArchivo): string => `${PREFIJO}${rol}`

export const archivoPendiente = (url: string | null | undefined): boolean => typeof url === 'string' && url.startsWith(PREFIJO)

export const rolDePendiente = (url: string): RolArchivo | null => {
  const rol = url.slice(PREFIJO.length)
  return rol === 'xml' || rol === 'pdf' ? rol : null
}

/** Un documento guardado cuyo archivo no llegó a Drive: se reenvía con "Reintentar subida". */
export interface ArchivoPendienteInfo {
  lado: 'cobro' | 'proveedor'
  id: string
  rol: RolArchivo
  nombre: string
}
