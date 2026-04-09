// Definición de columnas para cada tabla de Supabase ↔ Google Sheets.
//
// Cada tabla tiene:
//   - tab:     nombre de la pestaña en el Google Sheet
//   - table:   nombre de la tabla en Supabase
//   - pk:      nombre de la columna PK (para upsert)
//   - columns: columnas que se sincronizan (en orden → define el orden en Sheets)
//   - readonly: columnas que NO se modifican al hacer sync-up (calculadas/auto)

export interface TableSchema {
  tab: string
  table: string
  pk: string
  columns: string[]
  readonly: string[]
  orderBy?: string  // columna para ordenar en sync-down; default 'created_at'
}

export const TABLE_SCHEMAS: TableSchema[] = [
  {
    tab: 'Cotizaciones',
    table: 'cotizaciones',
    pk: 'id',
    columns: [
      'id', 'cliente', 'proyecto', 'fecha_entrega', 'locacion',
      'fecha_cotizacion', 'tipo', 'es_complementaria_de', 'estado',
      'subtotal', 'fee_agencia', 'general', 'iva', 'total',
      'margen_total', 'utilidad_total', 'porcentaje_fee', 'iva_activo',
      'descuento_tipo', 'descuento_valor', 'created_at', 'drive_file_id',
    ],
    readonly: ['subtotal', 'fee_agencia', 'general', 'iva', 'total', 'margen_total', 'utilidad_total', 'created_at', 'drive_file_id'],
  },
  {
    tab: 'Items Cotizacion',
    table: 'items_cotizacion',
    pk: 'id',
    columns: [
      'id', 'cotizacion_id', 'categoria', 'descripcion', 'cantidad',
      'precio_unitario', 'importe', 'responsable_nombre', 'responsable_id',
      'x_pagar', 'margen', 'orden', 'notas',
    ],
    readonly: ['importe', 'margen'],
    orderBy: 'cotizacion_id',  // no tiene created_at
  },
  {
    tab: 'Proyectos',
    table: 'proyectos',
    pk: 'id',
    columns: [
      'id', 'cliente', 'proyecto', 'fecha_entrega', 'locacion',
      'horarios', 'punto_encuentro', 'estado', 'notas', 'created_at',
    ],
    readonly: ['created_at'],
  },
  {
    tab: 'Responsables',
    table: 'responsables',
    pk: 'id',
    columns: [
      'id', 'nombre', 'telefono', 'correo', 'banco', 'clabe',
      'roles', 'notas', 'activo', 'created_at',
    ],
    readonly: ['created_at'],
  },
  {
    tab: 'Productos',
    table: 'productos',
    pk: 'id',
    columns: [
      'id', 'descripcion', 'categoria', 'precio_unitario',
      'x_pagar_sugerido', 'activo', 'created_at',
    ],
    readonly: ['created_at'],
  },
  {
    tab: 'Clientes',
    table: 'clientes',
    pk: 'id',
    columns: ['id', 'nombre', 'proyectos', 'activo', 'created_at'],
    readonly: ['created_at'],
  },
  {
    tab: 'Cuentas por Cobrar',
    table: 'cuentas_cobrar',
    pk: 'id',
    columns: [
      'id', 'cotizacion_id', 'cliente', 'proyecto', 'monto_total',
      'estado', 'fecha_vencimiento', 'fecha_pago', 'notas',
    ],
    readonly: [],
  },
  {
    tab: 'Cuentas por Pagar',
    table: 'cuentas_pagar',
    pk: 'id',
    columns: [
      'id', 'cotizacion_id', 'proyecto_id', 'item_id', 'responsable_id',
      'responsable_nombre', 'item_descripcion', 'cantidad', 'x_pagar',
      'margen', 'telefono', 'correo', 'clabe', 'banco',
      'estado', 'fecha_pago', 'metodo_pago', 'notas',
    ],
    readonly: [],
  },
]

/** Busca el schema de una tabla por nombre de pestaña o nombre de tabla. */
export function findSchema(nameOrTab: string): TableSchema | undefined {
  return TABLE_SCHEMAS.find(s => s.tab === nameOrTab || s.table === nameOrTab)
}

/** Convierte un valor de Supabase al string/number que irá en Sheets. */
export function toSheetValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 'SI' : 'NO'
  if (Array.isArray(value)) return JSON.stringify(value)
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'number') return value
  return String(value)
}

/** Convierte un valor del Sheet al tipo esperado por Supabase. */
export function fromSheetValue(rawValue: string, column: string): unknown {
  const v = rawValue?.trim() ?? ''

  // Boolean columns
  const boolCols = ['iva_activo', 'activo']
  if (boolCols.includes(column)) {
    if (v === 'SI' || v === 'true' || v === '1') return true
    if (v === 'NO' || v === 'false' || v === '0') return false
    return null
  }

  // Array columns
  const arrayCols = ['roles', 'proyectos']
  if (arrayCols.includes(column)) {
    if (!v) return []
    try { return JSON.parse(v) } catch { return [v] }
  }

  // Number columns
  const numCols = [
    'subtotal', 'fee_agencia', 'general', 'iva', 'total',
    'margen_total', 'utilidad_total', 'porcentaje_fee', 'descuento_valor',
    'cantidad', 'precio_unitario', 'importe', 'x_pagar', 'margen',
    'orden', 'x_pagar_sugerido', 'monto_total',
  ]
  if (numCols.includes(column)) {
    const n = parseFloat(v)
    return isNaN(n) ? null : n
  }

  return v || null
}
