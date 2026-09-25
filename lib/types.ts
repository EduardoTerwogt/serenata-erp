export type EstadoCotizacion = 'BORRADOR' | 'EMITIDA' | 'APROBADA' | 'CANCELADA'
export type EstadoProyecto = 'PREPRODUCCION' | 'RODAJE' | 'POSTPRODUCCION' | 'FINALIZADO'
export type EstadoPago = 'PENDIENTE' | 'PAGADO' | 'PARCIAL'

export type EstadoCuentaCobrar = 'FACTURA_PENDIENTE' | 'FACTURADO' | 'PARCIALMENTE_PAGADO' | 'PAGADO' | 'VENCIDO'
export type EstadoCuentaPagar = 'PENDIENTE' | 'EN_PROCESO_PAGO' | 'PAGADO'
export type EstadoCuentaPagarGrupo = 'ABIERTO' | 'FACTURADO' | 'EN_PROCESO_PAGO' | 'PAGADO'
export type TipoPago = 'TRANSFERENCIA' | 'EFECTIVO'

export type RegimenFiscal = 'moral' | 'fisica' | 'resico'

export type PortalEstado = 'pendiente_confirmacion' | 'activo'
export type TipoDocumentoProveedor =
  | 'CONSTANCIA_SITUACION_FISCAL'
  | 'INE'
  | 'COMPROBANTE_DOMICILIO'
  | 'COMPROBANTE_BANCARIO'
// EstadoValidacionDocumento ya está definido más abajo (junto a
// DocumentoCuentaCobrar) -- ProveedorDocumento lo reusa tal cual.

// Renombrado de "Responsable" a "Proveedor" (Fase 5.3, Bloque 0): la tabla
// responsables -> proveedores. Serenata contrata por proyecto (sin nómina),
// así que hoy no hace falta distinguir interno/externo; cuando exista
// personal en nómina será una sección aparte.
export interface Proveedor {
  id: string
  nombre: string
  alias?: string | null
  telefono: string | null
  correo: string | null
  banco: string | null
  clabe: string | null
  roles: string[]
  notas: string | null
  activo: boolean
  created_at: string
  // Escenario fiscal del proveedor (Fase 5.1/5.3): 'moral' = IVA 16% acreditable sin
  // retencion; 'fisica' = persona fisica con honorarios, retencion IVA 2/3 + ISR 10%;
  // 'resico' = persona fisica RESICO, retencion IVA 2/3 + ISR 1.25% (Art. 113-J LISR).
  // null = no capturado aun -> se trata como 'moral' por default en los calculos.
  regimen_fiscal: RegimenFiscal | null
  // Portal de proveedores (Fase 5.5): la identidad del portal ES esta misma
  // fila -- nunca una tabla de "usuarios de portal" separada. Sus
  // credenciales viven aparte, en ProveedorCredenciales.
  portal_estado: PortalEstado | null
  match_candidato_id: string | null
}

/**
 * Credenciales del portal de la fila `proveedores`. Solo servidor: nunca van
 * en una respuesta. `Proveedor` (lo que sí puede salir) no las incluye y el
 * repositorio las excluye con una lista blanca de columnas
 * (PROVEEDOR_PUBLIC_COLUMNS en lib/server/repositories/proveedores.ts).
 */
export interface ProveedorCredenciales {
  id: string
  portal_estado: PortalEstado | null
  password_hash: string | null
  // Fase 2.5: se bumpea al cambiar credenciales -- invalida cualquier
  // cookie de sesión firmada con una versión vieja, sin esperar a que expire.
  session_version: number
}

export interface ProveedorDocumento {
  id: string
  proveedor_id: string
  tipo: TipoDocumentoProveedor
  archivo_url: string
  archivo_nombre: string
  estado_validacion: EstadoValidacionDocumento
  // Punto 2 (2026-09-20): motivo cuando estado_validacion = 'revision' --
  // auto-clasificación que no pudo leer el documento, o nota de staff al
  // corregir a mano. NULL en pendiente/validado. Mismo campo que ya existe
  // en DocumentoCuentaCobrar/DocumentoCuentaPagar.
  detalle_validacion: string | null
  created_at: string
}

export interface CandidatoMatchProveedor {
  id: string
  nombre: string
  score: number
}

export interface HistorialResponsable {
  id: string
  responsable_id: string
  cotizacion_id: string | null
  proyecto_id: string | null
  proyecto_nombre: string
  cliente: string
  fecha_evento: string | null
  rol_en_proyecto: string | null
  x_pagar: number
  created_at: string
}

// Log append-only de reasignaciones de responsable en items_cotizacion.
// No confundir con HistorialResponsable (snapshot de historial de proyectos
// por responsable, tabla distinta).
export interface HistorialCambioResponsableItem {
  id: string
  item_id: string
  cotizacion_id: string
  responsable_anterior_id: string | null
  responsable_anterior_nombre: string | null
  responsable_nuevo_id: string | null
  responsable_nuevo_nombre: string | null
  changed_at: string
  changed_by: string | null
}

export interface ItemCotizacion {
  id: string
  cotizacion_id: string
  categoria: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  importe: number
  responsable_nombre: string | null
  responsable_id: string | null
  x_pagar: number
  margen: number
  orden: number
  notas?: string | null
  revision?: number
}

export interface Producto {
  id: string
  descripcion: string
  categoria: string | null
  precio_unitario: number
  x_pagar_sugerido: number
  activo: boolean
  created_at: string
}

export interface ServiceTemplateItem {
  categoria: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  x_pagar: number
  responsable_nombre?: string | null
  responsable_id?: string | null
  producto_id?: string | null
}

export interface ServiceTemplate {
  id: string
  nombre: string
  descripcion: string | null
  items: ServiceTemplateItem[]
  activo: boolean
  created_at: string
  updated_at: string
}

export interface Cliente {
  id: string
  nombre: string
  tipo?: string | null
  contacto?: string | null
  correo?: string | null
  telefono?: string | null
  notas?: string | null
  proyectos: string[]
  activo: boolean
  created_at: string
}

export interface Cotizacion {
  id: string
  cliente: string
  cliente_id?: string | null
  proyecto: string
  fecha_entrega: string | null
  locacion: string | null
  fecha_cotizacion: string | null
  tipo: 'PRINCIPAL' | 'COMPLEMENTARIA'
  es_complementaria_de: string | null
  estado: EstadoCotizacion
  subtotal: number
  fee_agencia: number
  general: number
  iva: number
  total: number
  margen_total: number
  utilidad_total: number
  porcentaje_fee?: number
  iva_activo?: boolean
  descuento_tipo?: 'monto' | 'porcentaje'
  descuento_valor?: number
  created_at: string
  items?: ItemCotizacion[]
  itemsCount?: number
  drive_file_id?: string | null
  calendar_event_id?: string | null
  notas_internas?: string | null
  notas_pdf?: string | null
}

export interface Proyecto {
  id: string
  cliente: string
  proyecto: string
  fecha_entrega: string | null
  locacion: string | null
  horarios: string | null
  punto_encuentro: string | null
  estado: EstadoProyecto
  notas: string | null
  created_at: string
  cotizacion?: Cotizacion
  // Fase 5.2 Bloque 1 -- aditivo, conviven con `estado` (ver comentarios de
  // columna en db/migrations/20260906_fase52_proyectos_pm_schema.sql).
  tipo_proyecto_id?: string | null
  etapa_id?: string | null
  fecha_inicio_real?: string | null
  fecha_cierre_real?: string | null
}

// ==================== FASE 5.2 -- PROYECTOS COMO PM ====================

export interface TipoProyecto {
  id: string
  nombre: string
  activo: boolean
  created_at: string
}

export interface TipoProyectoEtapa {
  id: string
  tipo_proyecto_id: string
  nombre: string
  orden: number
  es_etapa_final: boolean
  created_at: string
}

export interface TipoProyectoConEtapas extends TipoProyecto {
  etapas: TipoProyectoEtapa[]
}

export interface TipoProyectoTareaDefault {
  id: string
  tipo_proyecto_id: string
  titulo: string
  descripcion: string | null
  es_hito: boolean
  dias_antes_entrega: number | null
  orden: number
  created_at: string
}

export type EstadoTareaProyecto = 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADA' | 'BLOQUEADA'
export type OrigenTareaProyecto = 'plantilla' | 'manual'

export interface ProyectoTarea {
  id: string
  proyecto_id: string
  titulo: string
  descripcion: string | null
  estado: EstadoTareaProyecto
  asignado_a: string | null
  asignado_a_nombre?: string | null
  es_hito: boolean
  origen: OrigenTareaProyecto
  fecha_limite: string | null
  fecha_completada: string | null
  created_at: string
  updated_at: string
}

export interface ProyectoTareaChecklistItem {
  id: string
  tarea_id: string
  texto: string
  completado: boolean
  orden: number
}

export type TipoProyectoDocumento =
  | 'BRIEF'
  | 'STAKEHOLDERS_RACI'
  | 'RUTA_CRITICA'
  | 'ROADMAP'
  | 'CHARTER'
  | 'RIESGOS'
  | 'PLAN_COMUNICACION'
  | 'STATUS_REPORT'
  | 'REPORTE_CIERRE'

export interface ProyectoDocumento {
  id: string
  proyecto_id: string
  tipo: TipoProyectoDocumento
  titulo: string | null
  contenido: Record<string, unknown>
  archivo_url: string | null
  archivo_nombre: string | null
  auto_generado_at: string | null
  editado_manualmente: boolean
  created_at: string
  updated_at: string
}

// Miembro de equipo resuelto para un proyecto (Stakeholders/RACI, Plan de
// Comunicación) -- combina responsables de items_cotizacion y de
// proyecto_tareas.asignado_a, ambos apuntando a `proveedores`.
export interface MiembroEquipoProyecto {
  proveedor_id: string
  nombre: string
  roles: string[]
  origen: ('item_cotizacion' | 'tarea')[]
}

export interface CuentaPagar {
  id: string
  cotizacion_id: string
  proyecto_id: string
  proyecto_nombre?: string
  item_id: string | null
  responsable_id: string | null
  responsable_nombre: string
  item_descripcion: string | null
  cantidad: number
  x_pagar: number
  margen: number
  telefono: string | null
  correo: string | null
  clabe: string | null
  banco: string | null
  estado: EstadoCuentaPagar | EstadoCuentaPagarGrupo
  folio?: string
  fecha_factura?: string | null
  fecha_vencimiento?: string | null
  monto_pagado?: number
  fecha_pago: string | null
  metodo_pago: string | null
  orden_pago_id?: string | null
  notas: string | null
  updated_at?: string
  created_at?: string
  grupo_id?: string | null
  // Bloque 6 (docs/PLAN.md): poblados por buscar_cuentas_pagar_grupos()
  // cuando la fila representa un grupo real en vez de un item suelto.
  es_grupo?: boolean
  items_count?: number
  // Bloque 6: poblados por cuentas_por_proyecto() (LEFT JOIN a
  // cuentas_pagar_grupos), null cuando el item no tiene grupo_id todavía.
  grupo_estado?: EstadoCuentaPagarGrupo | null
  grupo_monto_total?: number | null
  grupo_monto_pagado?: number | null
  // Bloque 2 (docs/PLAN.md): poblado por cuentas_por_proyecto() (LEFT JOIN a
  // proveedores) para que calcularCierreProyecto aplique la retención
  // correcta por grupo sin una query aparte.
  proveedor_regimen_fiscal?: RegimenFiscal | null
}

// Agrupa cuentas_pagar del mismo proveedor dentro del mismo proyecto para
// pedir/validar una sola factura y un solo pago sobre el total acumulado
// (docs/PLAN.md, iniciativa de agrupación de Cuentas por Pagar).
export interface CuentaPagarGrupo {
  id: string
  proyecto_id: string
  proyecto_nombre?: string
  responsable_id: string
  responsable_nombre?: string
  estado: EstadoCuentaPagarGrupo
  monto_total: number
  monto_pagado: number
  orden_pago_id: string | null
  created_at: string
  updated_at: string
  // Desglose de cuentas_pagar hijas -- lo agrega GET /api/cuentas-pagar/[id]/documentos
  // para que la UI muestre qué compone el total del grupo.
  items?: CuentaPagar[]
}

export interface CuentaCobrar {
  id: string
  cotizacion_id: string
  proyecto_id: string | null
  cliente: string
  proyecto: string
  monto_total: number
  estado: EstadoCuentaCobrar
  folio?: string
  fecha_factura?: string | null
  fecha_vencimiento?: string | null
  monto_pagado?: number
  fecha_pago: string | null
  notas: string | null
  created_at?: string
  updated_at?: string
}

export interface PagoComprobante {
  id: string
  cuentas_cobrar_id: string
  monto: number
  tipo_pago: TipoPago
  fecha_pago: string
  comprobante_url: string
  archivo_nombre: string
  notas?: string | null
  created_at: string
}

export type EstadoValidacionDocumento = 'pendiente' | 'validado' | 'revision'

export interface DocumentoCuentaCobrar {
  id: string
  cuentas_cobrar_id: string
  tipo: 'FACTURA_PDF' | 'FACTURA_XML' | 'COMPLEMENTO_PAGO' | 'COMPLEMENTO_PAGO_PDF' | 'OTRO'
  archivo_url: string
  archivo_nombre: string
  archivo_size?: number
  fecha_carga: string
  created_at: string
  estado_validacion: EstadoValidacionDocumento
  detalle_validacion?: string | null
  // 1E-3a: permite reconstruir, en la reconciliación, qué documento
  // corresponde a qué operación de idempotencia financiera.
  operation_id?: string | null
}

export interface DocumentoCuentaPagar {
  id: string
  // Exactamente uno de los dos (CHECK en la base): cuentas_pagar_id para
  // documentos legacy por item, grupo_id para facturación agrupada.
  cuentas_pagar_id?: string | null
  grupo_id?: string | null
  tipo: 'FACTURA_PROVEEDOR' | 'FACTURA_PROVEEDOR_XML' | 'COMPROBANTE_PAGO' | 'OTRO'
  archivo_url: string
  archivo_nombre: string
  fecha_carga: string
  created_at: string
  estado_validacion: EstadoValidacionDocumento
  detalle_validacion?: string | null
  operation_id?: string | null
}

export interface OrdenPago {
  id: string
  fecha_generacion: string
  pdf_url: string
  pdf_nombre: string
  estado: 'GENERADA' | 'PARCIALMENTE_PAGADA' | 'COMPLETADA'
  total_monto: number
  notas?: string | null
  created_by: string
  created_at: string
  updated_at?: string
}

// Fase 5.6 -- Dashboard ejecutivo. Lista simple recurrente (sin variación
// mes a mes) -- decisión de Eduardo, 2026-09-07.
export interface GastoFijo {
  id: string
  nombre: string
  monto_mensual: number
  activo: boolean
  created_at: string
}
