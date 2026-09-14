import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { Proveedor } from '@/lib/types'

// EF-3 3B-6: volumen real 10, objetivo de capacidad 1,000 (CLAUDE.md), justo
// en el borde del cap real de PostgREST (max_rows=1000, verificado en
// supabase/config.toml:18). Cursor movido a la RPC proveedores_pagina_por_nombre
// (db/migrations/20260914_proveedores_pagina_por_nombre.sql) -- compara
// (nombre, id) > (cursor) como tupla nativa de Postgres, con parámetros
// bindeados (nunca interpolación de texto en un filtro .or(), que trataría
// `,`/`(`/`)` en un nombre real como sintaxis reservada). El ORDER BY lo
// decide Postgres, nunca se reordena en Node.
const PROVEEDORES_PAGE_SIZE = 500
const PROVEEDORES_HARD_CAP = 20000

export async function getProveedores() {
  let all: Proveedor[] = []
  let cursorNombre: string | null = null
  let cursorId: string | null = null

  while (true) {
    const { data, error } = await supabaseAdmin.rpc('proveedores_pagina_por_nombre', {
      p_cursor_nombre: cursorNombre,
      p_cursor_id: cursorId,
      p_page_size: PROVEEDORES_PAGE_SIZE,
    })
    if (error) throw error
    if (!data || data.length === 0) break

    all = all.concat(data as Proveedor[])
    if (all.length > PROVEEDORES_HARD_CAP) {
      throw new Error(
        `getProveedores() superó el circuit breaker de ${PROVEEDORES_HARD_CAP} filas sin agotar la tabla -- ` +
        `posible bug de paginación o crecimiento muy por encima del objetivo de capacidad (1,000). ` +
        `Fallando explícito en vez de devolver un array parcial a los consumidores (dropdowns/lista).`
      )
    }

    const last = data[data.length - 1] as Proveedor
    cursorNombre = last.nombre
    cursorId = last.id
    if (data.length < PROVEEDORES_PAGE_SIZE) break
  }

  return all // ya viene ordenado por Postgres -- ORDER BY nombre ASC, id ASC de la RPC, sin reordenar en Node
}

export async function getProveedorById(id: string) {
  const { data, error } = await supabaseAdmin
    .from('proveedores')
    .select('*, historial_responsable(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

/**
 * Query específica para validar la sesión del portal (Fase 2.5) en cada
 * request -- no trae `*` ni el join de historial_responsable, que
 * getProveedorById sí trae y aquí no hace falta.
 */
export async function getProveedorSessionState(id: string): Promise<{ activo: boolean; session_version: number } | null> {
  const { data, error } = await supabaseAdmin
    .from('proveedores')
    .select('activo, session_version')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createProveedor(proveedor: Partial<Proveedor>) {
  const { data, error } = await supabaseAdmin
    .from('proveedores')
    .insert(proveedor)
    .select()
    .single()
  if (error) throw error
  return data as Proveedor
}

export async function updateProveedor(id: string, updates: Partial<Proveedor>) {
  const { data, error } = await supabaseAdmin
    .from('proveedores')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Proveedor
}

// Busca un proveedor por nombre exacto (case-insensitive) o lo crea con
// datos mínimos (solo nombre) si no existe. Usado al asignar responsable en
// una partida por texto libre (Fase 5.3, Bloque 0, punto 2): la asignación
// siempre debe resolver a un id real, nunca quedarse en solo texto suelto.
// Datos fiscales/bancarios se llenan después, a mano o vía el futuro Portal.
// Fase 5.8: resumen de documentación para el panel de portal en la lista de
// Proveedores -- trae proveedor_id/tipo/estado_validacion de TODOS los
// documentos (sin filtrar por proveedor) para que la agregación (completa/
// incompleta/con errores) se calcule en JS, mismo criterio que el resto del
// repo para resúmenes ("no vistas SQL nuevas").
export async function findOrCreateProveedorByNombre(nombre: string): Promise<Proveedor> {
  const nombreLimpio = nombre.trim()
  const { data: existente, error: buscarError } = await supabaseAdmin
    .from('proveedores')
    .select('*')
    .ilike('nombre', nombreLimpio)
    .limit(1)
    .maybeSingle()
  if (buscarError) throw buscarError
  if (existente) return existente as Proveedor

  const { data: creado, error: crearError } = await supabaseAdmin
    .from('proveedores')
    .insert({ nombre: nombreLimpio, activo: true })
    .select()
    .single()
  if (crearError) throw crearError
  return creado as Proveedor
}
