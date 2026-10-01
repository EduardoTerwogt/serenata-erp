// Definición de columnas para cada tabla de Supabase ↔ Google Sheets.
//
// Cada tabla tiene:
//   - tab:     nombre de la pestaña en el Google Sheet
//   - table:   nombre de la tabla en Supabase
//   - pk:      nombre de la columna PK (para upsert)
//   - columns: columnas que se sincronizan (en orden → define el orden en Sheets)
//   - readonly: columnas calculadas/auto (el espejo es solo de salida: Supabase → Sheets)

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
      'id', 'cliente', 'cliente_id', 'proyecto', 'fecha_entrega', 'locacion',
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
      'id', 'cliente', 'cliente_id', 'proyecto', 'fecha_entrega', 'locacion',
      'horarios', 'punto_encuentro', 'estado', 'notas', 'created_at',
    ],
    readonly: ['created_at'],
  },
  {
    tab: 'Responsables',
    table: 'proveedores',
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
    tab: 'Historial Responsables',
    table: 'historial_responsable',
    pk: 'id',
    columns: [
      'id', 'responsable_id', 'cotizacion_id', 'proyecto_id',
      'proyecto_nombre', 'cliente', 'cliente_id', 'fecha_evento', 'rol_en_proyecto',
      'x_pagar', 'created_at',
    ],
    readonly: ['created_at'],
  },
  {
    tab: 'Cuentas por Cobrar',
    table: 'cuentas_cobrar',
    pk: 'id',
    columns: [
      'id', 'cotizacion_id', 'cliente', 'cliente_id', 'proyecto', 'monto_total',
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

/** Convierte un valor de Supabase al string/number que irá en Sheets. */
export function toSheetValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 'SI' : 'NO'
  if (Array.isArray(value)) return JSON.stringify(value)
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'number') return value
  return String(value)
}
