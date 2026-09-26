import type { Proveedor, ProveedorCredenciales } from '@/lib/types'

/**
 * Columnas de `proveedores` que pueden salir del servidor: lista blanca, no
 * `*`, para que `password_hash` y `session_version` (credenciales del portal,
 * ProveedorCredenciales) nunca lleguen a una respuesta, ni una columna nueva
 * sensible entre sin que alguien la agregue aquí a propósito. Las únicas
 * lecturas de credenciales viven en repositories/portal.ts (login y signup).
 */
export const PROVEEDOR_PUBLIC_COLUMNS =
  'id, nombre, alias, telefono, correo, banco, clabe, roles, notas, activo, created_at, regimen_fiscal, portal_estado, match_candidato_id'

const CAMPOS_PUBLICOS = PROVEEDOR_PUBLIC_COLUMNS.split(', ') as (keyof Proveedor)[]

/** Para filas completas que llegan de una RPC (`SETOF proveedores`): deja solo las columnas públicas. */
export function proveedorPublico(fila: Proveedor | (Proveedor & Partial<ProveedorCredenciales>)): Proveedor {
  const out: Record<string, unknown> = {}
  for (const campo of CAMPOS_PUBLICOS) if (campo in fila) out[campo] = fila[campo]
  return out as unknown as Proveedor
}
