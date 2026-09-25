import type { Proveedor } from '@/lib/types'

/**
 * Proveedor sin credenciales del portal: lo que puede llegar al navegador del
 * staff. `password_hash` y `session_version` nunca salen del servidor.
 */
export type ProveedorPublico = Omit<Proveedor, 'password_hash' | 'session_version'>

export function proveedorPublico(p: Proveedor): ProveedorPublico {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, session_version, ...resto } = p
  return resto
}
