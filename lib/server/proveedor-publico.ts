import type { Proveedor } from '@/lib/types'

/**
 * Proveedor sin credenciales del portal: lo que puede llegar al navegador del
 * staff. `password_hash` y `session_version` nunca salen del servidor.
 * `Proveedor` ya no las incluye (viven en ProveedorCredenciales); el filtro
 * es la lista blanca PROVEEDOR_PUBLIC_COLUMNS del repositorio.
 */
export type ProveedorPublico = Proveedor

export { proveedorPublico } from '@/lib/server/repositories/proveedor-publico'
