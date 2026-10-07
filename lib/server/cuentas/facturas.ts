/**
 * #123 (B3, P3, P4, P18, P24): "Subir factura" detecta del XML si es de cliente, de proveedor o un complemento de pago
 * (por RFC contra el de la constancia de Serenata), propone la contraparte y lo que se puede ligar, y confirma el alta. Dos pasos:
 *
 * - `previsualizarFactura` (no escribe nada, T9): clasifica el CFDI, encuentra la contraparte por RFC, lista lo que
 *   se puede ligar con la preselección por los folios SH de los conceptos (P4) y, si ya hay cuentas elegidas, el
 *   cuadre exacto de `factura_cuadre` (suma contra XML, tolerancia de 0.01 por cotización, P26) o la validación
 *   fiscal del proveedor.
 * - `confirmarFactura`: cliente → `ligar_factura` (RFC que no coincide = "En revisión", no se rechaza); proveedor →
 *   el servicio de grupo existente (1:1 por grupo); complemento → `ligar_complemento_*`. Los archivos van a
 *   `/Por Cobrar/<cliente>/` o `/Por Pagar/<proveedor>/` (T15). El PDF puede llegar después por `.../documentos`.
 *
 * Toda la regla del total vive en SQL (T19): aquí solo se lee el XML, se clasifica y se llama.
 */
import { randomUUID } from 'node:crypto'
import { getCuentaPagarGrupoById, getProyectoById } from '@/lib/db'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { CandidatoFacturaCobro, CandidatoFacturaProveedor, LadoCuentas } from '@/lib/shared/cuentas/estado-cuenta-tipos'
import { validarFacturaFiscalProveedor } from '@/lib/server/validation/factura-fiscal'
import { parseComplementoPagoXML, relacionadosDeComplemento } from '@/lib/server/xml/complemento-parser'
import { parseFacturaXML, type FacturaData } from '@/lib/server/xml/factura-parser'
import { carpetaContraparte } from './carpetas'
import { ligarComplemento } from './complemento'
import { resolverContraparteDeDestinos } from './contrapartes'
import { cargarCandidatosFactura } from './estado-cuenta-rpc'
import { serenataRfc, toleranciaTotal } from './datos-fiscales'
import { prepararGrupoFacturaProveedor, type GrupoPreparado, type ProveedorNuevo } from './preparar-grupo'
import { clasificarCfdi, foliosEnConceptos, normalizarRfc, regimenSugerido, type TipoDocumentoCuentas } from './rfc'
import { subirFacturaCobro } from './subir-factura'
import { subirFacturaProveedor } from './subir-factura-proveedor'
import type { RegimenFiscal } from '@/lib/types'

type Respuesta = { status: number; body: Record<string, unknown> }

export interface ContraparteRfc {
  id: string
  nombre: string
  rfc: string | null
}

/** Cuentas de cobro cuya cotización el XML nombra por folio SH (P4); el resto se elige a mano. */
export function preseleccionPorFolios(candidatos: Pick<CandidatoFacturaCobro, 'cuenta_id' | 'cotizacion_id'>[], folios: string[]): string[] {
  const buscados = new Set(folios.map((f) => f.toUpperCase()))
  return candidatos.filter((c) => c.cotizacion_id && buscados.has(c.cotizacion_id.toUpperCase())).map((c) => c.cuenta_id)
}

const tabla = (lado: LadoCuentas) => (lado === 'cobro' ? 'clientes' : 'proveedores')

/** Contrapartes activas con ese RFC (normalmente una; si hay varias el usuario elige). */
export async function contrapartesPorRfc(lado: LadoCuentas, rfc: string | null): Promise<ContraparteRfc[]> {
  if (!rfc) return []
  const { data, error } = await supabaseAdmin.from(tabla(lado)).select('id, nombre, rfc').eq('rfc', rfc).eq('activo', true).order('nombre')
  if (error) throw error
  return (data ?? []) as ContraparteRfc[]
}

async function contraparteElegida(lado: LadoCuentas, id: string): Promise<ContraparteRfc | null> {
  const { data, error } = await supabaseAdmin.from(tabla(lado)).select('id, nombre, rfc').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as ContraparteRfc | null) ?? null
}

interface Leido {
  data: FacturaData
  xmlContent: string
  tipo: TipoDocumentoCuentas
  lado: LadoCuentas
  rfcContraparte: string | null
}

/** Lee y clasifica el XML. Cualquier rechazo sale como respuesta HTTP antes de tocar Drive o la base. */
async function leerYClasificar(xmlFile: File): Promise<{ ok: true; leido: Leido } | { ok: false; respuesta: Respuesta }> {
  const xmlContent = await xmlFile.text()
  if (!xmlContent.trim().startsWith('<')) {
    return { ok: false, respuesta: { status: 400, body: { error: 'El archivo XML no contiene datos XML válidos' } } }
  }
  const data = parseFacturaXML(xmlContent)
  if (data.error) return { ok: false, respuesta: { status: 400, body: { error: `Error al parsear XML: ${data.error}` } } }
  const clasificacion = clasificarCfdi(data, await serenataRfc())
  if (!clasificacion.ok) {
    return { ok: false, respuesta: { status: 400, body: { error: clasificacion.codigo, message: clasificacion.mensaje } } }
  }
  // Un complemento de pago (tipo P) trae Total = 0: el monto solo es obligatorio en una factura.
  if (!esComplemento(clasificacion.tipo) && (!data.fecha_emision || !data.monto_total)) {
    return { ok: false, respuesta: { status: 400, body: { error: 'Factura incompleta: falta fecha o monto' } } }
  }
  return { ok: true, leido: { data, xmlContent, tipo: clasificacion.tipo, lado: clasificacion.lado, rfcContraparte: clasificacion.rfcContraparte } }
}

const esComplemento = (tipo: TipoDocumentoCuentas) => tipo === 'complemento_cobro' || tipo === 'complemento_proveedor'

// ── Vista previa ──────────────────────────────────────────────────────────────

export interface PreviewParams {
  xmlFile: File
  contraparteId?: string | null
  /** Cuentas de cobro (cliente) o grupo (proveedor) ya elegidos, para calcular el cuadre. */
  cuentas: string[]
}

export async function previsualizarFactura(p: PreviewParams): Promise<Respuesta> {
  const r = await leerYClasificar(p.xmlFile)
  if (!r.ok) return r.respuesta
  const { data, tipo, lado, rfcContraparte } = r.leido

  if (esComplemento(tipo)) {
    const complemento = parseComplementoPagoXML(r.leido.xmlContent)
    if (complemento.error) return { status: 400, body: { error: `Error al leer el complemento: ${complemento.error}` } }
    const relacionados = relacionadosDeComplemento(complemento)
    const uuids = Array.from(new Set(relacionados.map((x) => x.uuid_factura.toUpperCase())))
    const facturas = await facturasPorUuid(lado, uuids)
    return {
      status: 200,
      body: {
        tipo,
        lado,
        cfdi: { uuid: complemento.uuid ?? data.uuid_timbrado ?? null, fecha: data.fecha_emision ?? null },
        relacionados: relacionados.map((x) => ({ ...x, factura: facturas.get(x.uuid_factura.toUpperCase()) ?? null })),
      },
    }
  }

  const coincidencias = await contrapartesPorRfc(lado, rfcContraparte)
  const elegida = p.contraparteId ? await contraparteElegida(lado, p.contraparteId) : null
  const contraparte = elegida ?? (coincidencias.length === 1 ? coincidencias[0] : null)

  const cfdi = {
    uuid: data.uuid_timbrado ?? null,
    fecha: data.fecha_emision ?? null,
    total: data.monto_total ?? null,
    subtotal: data.subtotal ?? null,
    metodo_pago: data.metodo_pago ?? null,
    rfc_emisor: normalizarRfc(data.rfc_emisor),
    rfc_receptor: normalizarRfc(data.rfc_receptor),
    conceptos: data.conceptos ?? [],
    folios: foliosEnConceptos(data.conceptos),
  }
  const duplicada = await facturaVigenteConUuid(lado, data.uuid_timbrado ?? null)
  const tolerancia = await toleranciaTotal()
  // #130: sin grupo que cuadre, el emisor puede ser un proveedor nuevo y los renglones "por asignar" de un proyecto se
  // proponen por el neto del XML (subtotal) dentro de la tolerancia; solo propone, el usuario revisa y elige.
  const propuesta = lado === 'proveedor' ? await proponerRenglones(data.subtotal ?? 0, tolerancia) : []
  const coincidenciasNombre = lado === 'proveedor' && !contraparte ? await proveedoresPorNombre(data.nombre_emisor ?? null) : []

  let candidatos: CandidatoFacturaCobro[] | CandidatoFacturaProveedor[] = []
  let preseleccion: string[] = []
  let cuadre: unknown = null
  if (contraparte) {
    if (lado === 'cobro') {
      const cobro = await cargarCandidatosFactura('cobro', contraparte.id)
      candidatos = cobro
      preseleccion = preseleccionPorFolios(cobro, cfdi.folios)
      if (p.cuentas.length > 0) {
        const { data: c, error } = await supabaseAdmin.rpc('factura_cuadre', { p_total: data.monto_total ?? 0, p_cuentas: p.cuentas })
        if (error) throw error
        cuadre = c
      }
    } else {
      candidatos = await cargarCandidatosFactura('proveedor', contraparte.id)
      if (p.cuentas.length === 1) cuadre = await cuadreProveedor(p.cuentas[0], data, contraparte.id)
    }
  }

  return {
    status: 200,
    body: {
      tipo,
      lado,
      cfdi,
      rfc_contraparte: rfcContraparte,
      contraparte,
      /** Más de una contraparte con ese RFC: el usuario elige. */
      ambiguas: !elegida && coincidencias.length > 1 ? coincidencias : [],
      /** P24: sin coincidencia por RFC se elige a mano y se ofrece guardar el RFC. */
      ofrecer_guardar_rfc: !!contraparte && !contraparte.rfc && !!rfcContraparte,
      rfc_distinto: !!contraparte && !!contraparte.rfc && !!rfcContraparte && contraparte.rfc !== rfcContraparte,
      candidatos,
      preseleccion,
      cuadre,
      duplicada,
      tolerancia,
      propuesta,
      coincidencias_nombre: coincidenciasNombre,
      /** Datos del XML para prellenar el alta del proveedor (#130); el usuario completa banco, CLABE, correo y teléfono. */
      emisor: lado === 'proveedor' ? { rfc: normalizarRfc(data.rfc_emisor), nombre: data.nombre_emisor ?? null, regimen_codigo: data.regimen_emisor ?? null, regimen_sugerido: regimenSugerido(data.rfc_emisor, data.regimen_emisor) } : null,
      /** Datos del XML para completar la ficha del cliente (#130). */
      receptor: lado === 'cobro' ? { rfc: normalizarRfc(data.rfc_receptor), nombre: data.nombre_receptor ?? null } : null,
      cliente_tiene_constancia: lado === 'cobro' && contraparte ? await clienteTieneConstancia(contraparte.id) : null,
    },
  }
}

async function clienteTieneConstancia(id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from('clientes').select('constancia_url').eq('id', id).maybeSingle()
  if (error) throw error
  return Boolean((data as { constancia_url?: string | null } | null)?.constancia_url)
}

interface PropuestaRenglones {
  proyecto_id: string
  proyecto: string | null
  renglones: string[]
  neto: number
}

async function proponerRenglones(subtotal: number, tolerancia: number): Promise<PropuestaRenglones[]> {
  if (!(subtotal > 0)) return []
  const { data, error } = await supabaseAdmin.rpc('propuesta_renglones_factura', { p_subtotal: subtotal, p_tolerancia: tolerancia })
  if (error) throw error
  return (Array.isArray(data) ? data : []) as PropuestaRenglones[]
}

/** Proveedores con nombre parecido al del emisor, para ofrecer "es este proveedor" antes de crear uno nuevo (#130). */
async function proveedoresPorNombre(nombre: string | null): Promise<{ id: string; nombre: string; score: number }[]> {
  if (!nombre) return []
  const { data, error } = await supabaseAdmin.rpc('match_proveedor_por_nombre', { p_nombre: nombre, p_excluir_id: '00000000-0000-0000-0000-000000000000' })
  if (error) throw error
  return (data ?? []) as { id: string; nombre: string; score: number }[]
}

async function facturasPorUuid(lado: LadoCuentas, uuids: string[]): Promise<Map<string, { id: string; estado_validacion: string | null; metodo_pago: string | null; total_cfdi: number | null }>> {
  const mapa = new Map<string, { id: string; estado_validacion: string | null; metodo_pago: string | null; total_cfdi: number | null }>()
  if (uuids.length === 0) return mapa
  const [tablaDocs, tipoXml] = lado === 'cobro' ? (['documentos_cuentas_cobrar', 'FACTURA_XML'] as const) : (['documentos_cuentas_pagar', 'FACTURA_PROVEEDOR_XML'] as const)
  const { data, error } = await supabaseAdmin
    .from(tablaDocs)
    .select('id, uuid_cfdi, estado_validacion, metodo_pago_cfdi, total_cfdi')
    .eq('tipo', tipoXml)
    .is('eliminado_at', null)
  if (error) throw error
  const buscados = new Set(uuids)
  for (const d of data ?? []) {
    const u = (d.uuid_cfdi as string | null)?.toUpperCase()
    if (u && buscados.has(u)) {
      mapa.set(u, { id: d.id as string, estado_validacion: d.estado_validacion as string | null, metodo_pago: d.metodo_pago_cfdi as string | null, total_cfdi: d.total_cfdi as number | null })
    }
  }
  return mapa
}

async function facturaVigenteConUuid(lado: LadoCuentas, uuid: string | null): Promise<{ id: string } | null> {
  if (!uuid) return null
  const [tablaDocs, tipoXml] = lado === 'cobro' ? (['documentos_cuentas_cobrar', 'FACTURA_XML'] as const) : (['documentos_cuentas_pagar', 'FACTURA_PROVEEDOR_XML'] as const)
  const { data, error } = await supabaseAdmin.from(tablaDocs).select('id').eq('tipo', tipoXml).eq('uuid_cfdi', uuid).is('eliminado_at', null).limit(1).maybeSingle()
  if (error) throw error
  return data ? { id: data.id as string } : null
}

/** Validación fiscal del XML de un proveedor contra el neto del grupo (la misma regla que al subirlo). */
async function cuadreProveedor(grupoId: string, data: FacturaData, proveedorId: string) {
  const grupo = await getCuentaPagarGrupoById(grupoId)
  if (!grupo || grupo.responsable_id !== proveedorId) return null
  const { data: proveedor } = await supabaseAdmin.from('proveedores').select('regimen_fiscal').eq('id', proveedorId).maybeSingle()
  const regimen = ((proveedor as { regimen_fiscal?: RegimenFiscal | null } | null)?.regimen_fiscal ?? null) as RegimenFiscal | null
  const v = validarFacturaFiscalProveedor(data, Number(grupo.monto_total || 0), regimen)
  return { estado: v.estado_validacion, detalle: v.detalle_validacion, monto_total: Number(grupo.monto_total || 0) }
}

// ── Confirmación ──────────────────────────────────────────────────────────────

export interface ConfirmarParams {
  xmlFile: File
  pdfFile: File | null
  operationId: string
  contraparteId?: string | null
  guardarRfc: boolean
  /** Cliente: cuentas de cobro que cubre, con el total que el usuario vio. */
  cuentas: { id: string; monto_esperado?: number | null }[]
  /** Proveedor: el grupo al que corresponde. */
  grupoId?: string | null
  /** #130 (proveedor): alta del proveedor y asignación de renglones o gasto extra, antes de subir la factura. */
  preparar?: { proveedor?: ProveedorNuevo; renglones?: string[]; gasto?: { proyecto_id: string; concepto: string; costo_total: number } } | null
  /** Complemento: desambigua el pago. */
  pagoId?: string | null
  usuario: string | null
  /** Carpeta raíz de Drive ya resuelta (con el override de pruebas de carga). */
  uploadFolderId?: string
  route: string
}

export async function confirmarFactura(p: ConfirmarParams): Promise<Respuesta> {
  const r = await leerYClasificar(p.xmlFile)
  if (!r.ok) return r.respuesta
  const { tipo, lado, rfcContraparte, xmlContent } = r.leido

  if (esComplemento(tipo)) {
    const porRfc = await contrapartesPorRfc(lado, rfcContraparte)
    const contraparte = p.contraparteId ? await contraparteElegida(lado, p.contraparteId) : porRfc.length === 1 ? porRfc[0] : null
    return ligarComplemento({
      lado,
      xmlFile: p.xmlFile,
      pdfFile: p.pdfFile,
      pagoId: p.pagoId ?? null,
      carpeta: carpetaContraparte(lado, contraparte?.nombre ?? 'Sin contraparte'),
      uploadFolderId: p.uploadFolderId,
      usuario: p.usuario,
      route: p.route,
    })
  }

  if (lado === 'cobro') {
    if (p.cuentas.length === 0) return { status: 400, body: { error: 'lineas_requeridas', message: 'La factura necesita al menos una cotización.' } }
    const rc = await resolverContraparteDeDestinos('cobro', p.cuentas.map((c) => c.id))
    if (!rc.ok) return { status: rc.status, body: rc.body }
    const cliente = rc.contraparte
    const aviso = avisoRfc('cliente', rfcContraparte, cliente.rfc)

    const resultado = await subirFacturaCobro({
      cuentas: p.cuentas,
      xmlFile: p.xmlFile,
      pdfFile: p.pdfFile,
      carpeta: carpetaContraparte('cobro', cliente.nombre),
      uploadFolderId: p.uploadFolderId,
      usuario: p.usuario,
      operationId: p.operationId || randomUUID(),
      aviso,
      route: p.route,
    })
    if (resultado.status === 200) await guardarRfcSiSePidio(p.guardarRfc, 'cobro', cliente, rfcContraparte)
    return resultado
  }

  // Proveedor: la factura es 1:1 por grupo (P10).
  let grupoId = p.grupoId ?? null
  let preparado: GrupoPreparado | null = null
  if (p.preparar) {
    if (grupoId) return { status: 400, body: { error: 'destino_duplicado', message: 'Usa el grupo o prepara conceptos y proveedor, no ambos.' } }
    if (!p.contraparteId && !p.preparar.proveedor) return { status: 400, body: { error: 'proveedor_requerido', message: 'Elige un proveedor o captura sus datos.' } }
    preparado = await prepararGrupoFacturaProveedor({
      proveedorId: p.contraparteId ?? null,
      proveedor: p.preparar.proveedor,
      renglones: p.preparar.renglones,
      gasto: p.preparar.gasto,
      usuario: p.usuario,
      operationId: p.operationId || randomUUID(),
    })
    grupoId = preparado.grupo_id
  }
  if (!grupoId) return { status: 400, body: { error: 'lineas_requeridas', message: 'Elige el proyecto (grupo) al que corresponde la factura.' } }
  const grupoDestino = grupoId

  // La preparación (proveedor + renglones o gasto) ya se confirmó en su propia transacción: lo que falle de aquí en
  // adelante deja un estado consistente y reintentable. Toda respuesta que no sea 200 y toda excepción llevan `preparado`
  // para que la ventana reintente con ese proveedor y grupo, no con el alta (que fallaría por RFC repetido).
  const conPreparado = (r: Respuesta): Respuesta => (preparado && r.status !== 200 ? { ...r, body: { ...r.body, preparado: { proveedor_id: preparado.proveedor_id, grupo_id: preparado.grupo_id } } } : r)
  let resultado: Respuesta
  let proveedor: Awaited<ReturnType<typeof contraparteElegida>>
  try {
    const grupo = await getCuentaPagarGrupoById(grupoDestino)
    if (!grupo) return conPreparado({ status: 404, body: { error: 'Grupo de cuentas por pagar no encontrado' } })
    proveedor = await contraparteElegida('proveedor', grupo.responsable_id)
    if (!proveedor) return conPreparado({ status: 404, body: { error: 'Proveedor no encontrado' } })
    if (p.contraparteId && p.contraparteId !== grupo.responsable_id) {
      return conPreparado({ status: 409, body: { error: 'contrapartes_distintas', message: 'El grupo elegido es de otro proveedor.' } })
    }
    const proyecto = await getProyectoById(grupo.proyecto_id)
    if (!proyecto) return conPreparado({ status: 404, body: { error: 'Proyecto asociado no encontrado' } })
    resultado = await subirFacturaProveedor({
      grupo,
      xmlFile: p.xmlFile,
      pdfFile: p.pdfFile,
      xmlContent,
      carpeta: carpetaContraparte('proveedor', proveedor.nombre),
      uploadFolderId: p.uploadFolderId,
      usuario: p.usuario,
      aviso: avisoRfc('proveedor', rfcContraparte, proveedor.rfc),
    })
  } catch (error) {
    if (!preparado) throw error
    console.error(`[${p.route}] La factura no se guardó tras preparar el grupo:`, error instanceof Error ? error.message : error)
    return conPreparado({
      status: 502,
      body: { error: 'subida_fallida', message: 'La factura no se guardó, pero el proveedor y los conceptos ya quedaron listos. Vuelve a intentarlo con ese proveedor.' },
    })
  }
  if (resultado.status === 200) await guardarRfcSiSePidio(p.guardarRfc, 'proveedor', proveedor, rfcContraparte)
  return preparado && resultado.status === 200 ? { ...resultado, body: { ...resultado.body, preparado } } : conPreparado(resultado)
}

/** El RFC del XML contra el de la ficha: si la ficha lo tiene y es otro, la factura queda "En revisión" (P5, P24). */
export function avisoRfc(quien: 'cliente' | 'proveedor', rfcXml: string | null, rfcFicha: string | null): string | null {
  if (!rfcXml || !rfcFicha || normalizarRfc(rfcXml) === normalizarRfc(rfcFicha)) return null
  return `El RFC del XML (${rfcXml}) no coincide con el del ${quien} (${rfcFicha}).`
}

async function guardarRfcSiSePidio(guardar: boolean, lado: LadoCuentas, contraparte: { id: string | null; rfc: string | null }, rfcXml: string | null) {
  if (!guardar || !rfcXml || !contraparte.id || contraparte.rfc) return
  const { error } = await supabaseAdmin.from(tabla(lado)).update({ rfc: rfcXml }).eq('id', contraparte.id).is('rfc', null)
  if (error) console.error('[confirmarFactura] No se pudo guardar el RFC de la contraparte:', error.message)
}
