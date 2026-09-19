'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getJson, sendJson, sendFormData } from '@/lib/client/api'
import { SectionHero } from '@/components/ui/SectionHero'
import { SectionCard } from '@/components/ui/SectionCard'
import { FilterTabs, type FilterTab } from '@/components/ui/FilterTabs'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { Select } from '@/components/ui/Select'
import { Icon } from '@/components/ui/Icon'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { StatusBadge, toneForCuentaEstado, toneForValidacionEstado } from '@/components/ui/StatusBadge'
import { SectionLoading } from '@/components/ui/SectionLoading'
import { TableFooter } from '@/components/ui/TableFooter'
import type { ProveedorDocumento, TipoDocumentoProveedor, RegimenFiscal } from '@/lib/types'
import { calcularEjemploFactura, type EjemploFacturaEsperado } from '@/lib/shared/factura-fiscal'

// Bloque 1 (docs/PLAN.md): "Historial" deja de ser su propia tab -- la tabla
// "Tus cuentas con Serenata" se mueve al fondo de "Cuentas y facturas"
// (TabCuentas, función TablaHistorial más abajo), así el proveedor ve de
// inmediato que su factura recién subida quedó recibida/en proceso, sin
// cambiar de tab. Si esto se vuelve a mover en el futuro, esta es ya la
// segunda ubicación, no la primera (antes vivió en un tab propio).
type PortalTab = 'datos' | 'documentos' | 'cuentas'

const TABS: FilterTab<PortalTab>[] = [
  { value: 'datos', label: 'Mis datos' },
  { value: 'documentos', label: 'Documentación' },
  { value: 'cuentas', label: 'Cuentas y facturas' },
]

const TIPO_LABEL: Record<TipoDocumentoProveedor, string> = {
  CONSTANCIA_SITUACION_FISCAL: 'Constancia de situación fiscal',
  INE: 'INE',
  COMPROBANTE_DOMICILIO: 'Comprobante de domicilio',
  COMPROBANTE_BANCARIO: 'Comprobante bancario',
}

interface MeResponse {
  id: string
  nombre: string
  correo: string | null
  portal_estado: 'pendiente_confirmacion' | 'activo'
}

interface PerfilResponse {
  nombre: string
  alias: string | null
  telefono: string | null
  banco: string | null
  clabe: string | null
  regimen_fiscal: 'moral' | 'fisica' | null
}

interface GrupoPortalItem {
  id: string
  item_descripcion: string | null
  cantidad: number
  x_pagar: number
  cotizacion_id: string
}

interface GrupoPortal {
  id: string
  es_grupo: boolean
  facturable: boolean
  proyecto_id: string
  proyecto_nombre: string | null
  estado: string
  monto_total: number
  monto_pagado: number
  saldo_pendiente: number
  items: GrupoPortalItem[]
}

function formatMoney(value: number) {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function initialsFromName(nombre: string) {
  const partes = nombre.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')) || nombre.slice(0, 2)
}

export default function PortalPage() {
  const router = useRouter()
  const [tab, setTab] = useState<PortalTab>('datos')
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [perfil, setPerfil] = useState<PerfilResponse | null>(null)
  const [documentos, setDocumentos] = useState<ProveedorDocumento[]>([])
  const [grupos, setGrupos] = useState<GrupoPortal[]>([])

  const cargarTodo = () => {
    Promise.all([
      getJson<PerfilResponse>('/api/portal/perfil', 'Error al cargar tu perfil'),
      getJson<{ documentos: ProveedorDocumento[] }>('/api/portal/documentos', 'Error al cargar tus documentos'),
      getJson<{ grupos: GrupoPortal[] }>('/api/portal/cuentas', 'Error al cargar tus cuentas'),
    ]).then(([perfilRes, documentosRes, cuentasRes]) => {
      setPerfil(perfilRes)
      setDocumentos(documentosRes.documentos)
      setGrupos(cuentasRes.grupos)
    })
  }

  useEffect(() => {
    getJson<MeResponse>('/api/portal/me', 'No se pudo cargar tu cuenta')
      .then(data => {
        if (data.portal_estado === 'pendiente_confirmacion') {
          router.replace('/portal/confirmar-identidad')
          return
        }
        setMe(data)
        return cargarTodo()
      })
      .catch(() => router.replace('/portal/login'))
      .finally(() => setLoading(false))
  }, [router])

  const cerrarSesion = async () => {
    await sendJson('/api/portal/logout', {}, 'Error al cerrar sesión')
    router.replace('/portal/login')
  }

  const faltaDocumentacion =
    !documentos.some(d => d.tipo === 'INE') || !documentos.some(d => d.tipo === 'CONSTANCIA_SITUACION_FISCAL')

  if (loading || !me) return <SectionLoading />

  return (
    <div className="mx-auto w-full max-w-4xl flex flex-col gap-[19px]">
      <SectionHero
        title="Portal"
        action={
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-lg font-semibold text-ink">{me.nombre}</p>
              <p className="text-content text-subtext">Proveedor</p>
            </div>
            <Avatar initials={initialsFromName(me.nombre)} size={38} />
            <Button variant="secondary" onClick={cerrarSesion}>
              Salir
            </Button>
          </div>
        }
      />

      {faltaDocumentacion && (
        <div className="flex items-center gap-3 rounded-control bg-issued-bg border border-issued-fg/30 px-4 py-3 text-issued-fg">
          <Icon name="warning" size={16} />
          <span className="text-content">Sube tu documentación para completar tu perfil</span>
        </div>
      )}

      <FilterTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'datos' && perfil && (
        <TabDatos perfil={perfil} correo={me.correo} onGuardado={cargarTodo} />
      )}

      {tab === 'documentos' && (
        <TabDocumentos
          documentos={documentos}
          onSubido={requiereConfirmacion => {
            if (requiereConfirmacion) {
              router.push('/portal/confirmar-identidad')
              return
            }
            cargarTodo()
          }}
        />
      )}

      {tab === 'cuentas' && (
        <TabCuentas grupos={grupos} regimenFiscal={perfil?.regimen_fiscal ?? null} onFacturada={cargarTodo} />
      )}
    </div>
  )
}

function TabDatos({ perfil, correo, onGuardado }: { perfil: PerfilResponse; correo: string | null; onGuardado: () => void }) {
  const [nombre, setNombre] = useState(perfil.nombre)
  const [alias, setAlias] = useState(perfil.alias ?? '')
  const [telefono, setTelefono] = useState(perfil.telefono ?? '')
  const [banco, setBanco] = useState(perfil.banco ?? '')
  const [clabe, setClabe] = useState(perfil.clabe ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    setSuccess(false)
    try {
      await sendJson('/api/portal/perfil', { nombre, alias: alias.trim() || null, telefono, banco, clabe }, 'Error al guardar', { method: 'PATCH' })
      setSuccess(true)
      onGuardado()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="grid gap-[19px] items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      <SectionCard title="Datos personales" contentClassName="p-4 md:p-6 space-y-4">
        <TextField label="Nombre completo" type="text" value={nombre} onChange={e => setNombre(e.target.value)} />
        <TextField
          label="Alias · nombre corto u operativo (opcional)"
          type="text"
          value={alias}
          onChange={e => setAlias(e.target.value)}
          placeholder="nickname"
        />
        <TextField label="Teléfono" type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} />
        <TextField label="Correo" type="email" value={correo ?? ''} disabled />
      </SectionCard>

      <SectionCard title="Datos bancarios y fiscales" contentClassName="p-4 md:p-6 space-y-4">
        <TextField label="Banco" type="text" value={banco} onChange={e => setBanco(e.target.value)} />
        <TextField label="CLABE · 18 dígitos" type="text" value={clabe} onChange={e => setClabe(e.target.value)} maxLength={18} />
        <div>
          <span className="sn-label">Régimen fiscal</span>
          <p className="mt-1.5 text-content text-body">
            {perfil.regimen_fiscal === 'fisica'
              ? 'Persona física con honorarios'
              : perfil.regimen_fiscal === 'moral'
                ? 'Persona moral'
                : 'Pendiente de subir constancia fiscal, sube desde la sección Documentación'}
          </p>
        </div>

        {error && <StatusBanner tone="error">{error}</StatusBanner>}
        {success && <StatusBanner tone="success">Guardado</StatusBanner>}

        <Button type="submit" disabled={guardando} fullWidth>
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </SectionCard>
    </form>
  )
}

function TabDocumentos({
  documentos,
  onSubido,
}: {
  documentos: ProveedorDocumento[]
  onSubido: (requiereConfirmacion: boolean) => void
}) {
  const [subiendo, setSubiendo] = useState<TipoDocumentoProveedor | null>(null)
  const [error, setError] = useState<string | null>(null)

  const subir = async (tipo: TipoDocumentoProveedor, file: File) => {
    setSubiendo(tipo)
    setError(null)
    try {
      const formData = new FormData()
      formData.set('tipo', tipo)
      formData.set('archivo', file)
      const result = await sendFormData<{ requiere_confirmacion: boolean }>('/api/portal/documentos', formData, 'Error al subir el documento')
      onSubido(result.requiere_confirmacion)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir el documento')
    } finally {
      setSubiendo(null)
    }
  }

  return (
    <SectionCard title="Mis documentos" contentClassName="p-0">
      {error && <div className="p-4"><StatusBanner tone="error">{error}</StatusBanner></div>}
      {(Object.keys(TIPO_LABEL) as TipoDocumentoProveedor[]).map((tipo, i, arr) => {
        const existentes = documentos.filter(d => d.tipo === tipo)
        return (
          <div
            key={tipo}
            className={`flex items-center gap-[13px] p-4 md:px-6 ${i === arr.length - 1 ? '' : 'border-b border-hairline'}`}
          >
            <Icon name="file-text" size={16} className="text-faint flex-none" />
            <div className="flex-1 min-w-0">
              <p className="text-content text-body">{TIPO_LABEL[tipo]}</p>
              {existentes.length > 0 ? (
                <a href={existentes[0].archivo_url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline truncate mt-0.5 block">{existentes[0].archivo_nombre}</a>
              ) : (
                <p className="text-xs text-faint mt-0.5">Sin documento subido</p>
              )}
            </div>
            {existentes.length > 0 && (
              <StatusBadge tone={toneForValidacionEstado(existentes[0].estado_validacion)}>{existentes[0].estado_validacion}</StatusBadge>
            )}
            <label className="cursor-pointer flex-none border border-hairline bg-input hover:bg-row-alt text-body px-3 py-1.5 rounded-control text-sm transition-colors">
              {subiendo === tipo ? 'Subiendo...' : existentes.length ? 'Subir otro' : 'Subir'}
              <input
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                disabled={subiendo !== null}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) subir(tipo, file)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        )
      })}
    </SectionCard>
  )
}

function DesgloseFactura({ ejemplo }: { ejemplo: EjemploFacturaEsperado }) {
  return (
    <dl className="space-y-1 text-content text-subtext">
      <div className="flex justify-between"><dt>Subtotal</dt><dd className="text-body">{formatMoney(ejemplo.subtotal)}</dd></div>
      <div className="flex justify-between"><dt>IVA trasladado (16%)</dt><dd className="text-body">{formatMoney(ejemplo.iva_trasladado)}</dd></div>
      {ejemplo.iva_retenido > 0 && (
        <div className="flex justify-between"><dt>IVA retenido</dt><dd className="text-body">-{formatMoney(ejemplo.iva_retenido)}</dd></div>
      )}
      {ejemplo.isr_retenido > 0 && (
        <div className="flex justify-between"><dt>ISR retenido</dt><dd className="text-body">-{formatMoney(ejemplo.isr_retenido)}</dd></div>
      )}
      <div className="flex justify-between border-t border-hairline pt-1 mt-1"><dt className="text-body font-medium">Total</dt><dd className="text-body font-medium">{formatMoney(ejemplo.total)}</dd></div>
    </dl>
  )
}

function CampoArchivo({
  label,
  file,
  accept,
  onChange,
  inputRef,
}: {
  label: string
  file: File | null
  accept: string
  onChange: (file: File | null) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  return (
    <div>
      <span className="sn-label">{label}</span>
      <div className="mt-1.5 flex items-center gap-[13px] rounded-[var(--radius-sm)] border border-hairline bg-input py-2 pl-3.5 pr-2">
        <Icon name="file-text" size={16} className="text-faint flex-none" />
        <span className="flex-1 min-w-0 truncate text-content text-body">
          {file ? file.name : 'Ningún archivo seleccionado'}
        </span>
        <label className="cursor-pointer flex-none rounded-control border border-hairline bg-row px-3 py-1.5 text-sm text-body transition-colors hover:bg-row-alt">
          Elegir archivo
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={accept}
            onChange={e => onChange(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
    </div>
  )
}

function TabCuentas({
  grupos,
  regimenFiscal,
  onFacturada,
}: {
  grupos: GrupoPortal[]
  regimenFiscal: RegimenFiscal | null
  onFacturada: () => void
}) {
  const [grupoId, setGrupoId] = useState('')
  const [xml, setXml] = useState<File | null>(null)
  const [pdf, setPdf] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ejemplo, setEjemplo] = useState<EjemploFacturaEsperado | null>(null)
  const [success, setSuccess] = useState(false)
  const xmlInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const gruposFacturables = grupos.filter(g => g.facturable)
  const grupoSeleccionado = gruposFacturables.find(g => g.id === grupoId) ?? null
  const simulador = calcularEjemploFactura(grupoSeleccionado?.monto_total ?? 0, regimenFiscal)

  const subirFactura = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!grupoId) {
      setError('Selecciona a qué proyecto corresponde tu factura')
      return
    }
    if (!xml || !pdf) {
      setError('Sube el XML y el PDF de tu factura')
      return
    }
    setSubiendo(true)
    setError(null)
    setEjemplo(null)
    setSuccess(false)
    try {
      const formData = new FormData()
      formData.set('factura_xml', xml)
      formData.set('factura_pdf', pdf)
      const response = await fetch(`/api/portal/cuentas/grupos/${grupoId}/factura`, { method: 'POST', body: formData })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'Error al subir tu factura')
        if (data.ejemplo) setEjemplo(data.ejemplo)
        return
      }
      setSuccess(true)
      // El grupo recién facturado pasa a FACTURADO -- ya no debe seguir
      // seleccionable en "Proyecto al que corresponde". Recargar desde el
      // padre (en vez de solo actualizar estado local) para que quede
      // reflejado también en la tabla de historial de abajo. Limpiar
      // también el XML/PDF ya subidos (bug real: se quedaban seleccionados
      // en el formulario después de una subida exitosa) -- estado Y el
      // <input> nativo, para poder volver a elegir el mismo archivo en una
      // factura futura sin que el navegador ignore el cambio por ser el
      // mismo File.
      setGrupoId('')
      setXml(null)
      setPdf(null)
      if (xmlInputRef.current) xmlInputRef.current.value = ''
      if (pdfInputRef.current) pdfInputRef.current.value = ''
      onFacturada()
    } catch {
      setError('Error al subir tu factura')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="flex flex-col gap-[19px]">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[19px] items-start">
        <SectionCard title="Subir factura" contentClassName="p-4 md:p-6 space-y-4">
          <form onSubmit={subirFactura} className="space-y-4">
            <div>
              <span className="sn-label">Proyecto al que corresponde</span>
              <Select value={grupoId} onChange={e => setGrupoId(e.target.value)} className="mt-1.5 w-full">
                <option value="">Selecciona un proyecto...</option>
                {gruposFacturables.map(g => (
                  <option key={g.id} value={g.id}>
                    {(g.proyecto_nombre || 'Proyecto')} · {formatMoney(g.monto_total)}
                  </option>
                ))}
              </Select>
            </div>
            <CampoArchivo label="Archivo XML" file={xml} accept="text/xml,application/xml,.xml" onChange={setXml} inputRef={xmlInputRef} />
            <CampoArchivo label="Archivo PDF" file={pdf} accept="application/pdf" onChange={setPdf} inputRef={pdfInputRef} />

            {error && <StatusBanner tone="error">{error}</StatusBanner>}
            {success && <StatusBanner tone="success">Tu factura se subió correctamente. Serenata la revisará para procesar tu pago.</StatusBanner>}

            {ejemplo && (
              <div className="rounded-control border border-hairline bg-row p-3.5">
                <p className="text-content font-medium text-body mb-2">Así debe quedar tu factura:</p>
                <DesgloseFactura ejemplo={ejemplo} />
                <p className="mt-3 text-content text-faint">{ejemplo.explicacion}</p>
              </div>
            )}

            <Button type="submit" disabled={subiendo} fullWidth>
              {subiendo ? 'Subiendo...' : 'Validar y subir factura'}
            </Button>
          </form>
        </SectionCard>

        <SectionCard title="Simulador de factura" contentClassName="p-4 md:p-6 space-y-3">
          <p className="text-content text-subtext">
            {grupoSeleccionado
              ? 'Así debe quedar tu factura para este proyecto:'
              : 'Elige un proyecto en "Subir factura" para ver cómo debe quedar tu factura.'}
          </p>
          <DesgloseFactura ejemplo={simulador} />
          {grupoSeleccionado && <p className="mt-3 text-content text-faint">{simulador.explicacion}</p>}
        </SectionCard>
      </div>

      <TablaHistorial grupos={grupos} />
    </div>
  )
}

function conceptosDe(grupo: GrupoPortal): string {
  if (grupo.items.length > 1) return `${grupo.items.length} conceptos`
  return grupo.items[0]?.item_descripcion || '—'
}

// Bloque 1 (docs/PLAN.md): "Tus cuentas con Serenata" deja de vivir en su
// propia tab ("Historial") y se muestra al fondo de "Cuentas y facturas",
// como tabla -- mismo patrón visual que app/cotizaciones/page.tsx (tabla
// desktop con colgroup+table-fixed, cards en mobile, StatusBadge de 4
// tonos), no la lista de tarjetas apiladas que tenía antes. Así el
// proveedor ve de inmediato, en la misma pantalla donde acaba de subir su
// factura, que quedó validada/recibida y en qué estado de pago está.
// Mismo tamaño de página que app/cotizaciones/page.tsx (PAGE_SIZE) -- ahí
// pagina server-side vía RPC porque la tabla es global a toda la empresa;
// acá el proveedor ya trae TODOS sus grupos en un solo fetch a
// /api/portal/cuentas (siempre un dataset chico, acotado a un proveedor),
// así que paginar en cliente sobre el arreglo ya cargado es suficiente --
// no amerita un endpoint paginado nuevo para este volumen.
const HISTORIAL_PAGE_SIZE = 10

function TablaHistorial({ grupos }: { grupos: GrupoPortal[] }) {
  const [pagina, setPagina] = useState(1)
  const pageCount = Math.max(1, Math.ceil(grupos.length / HISTORIAL_PAGE_SIZE))
  const paginaActual = Math.min(pagina, pageCount)
  const inicio = (paginaActual - 1) * HISTORIAL_PAGE_SIZE
  const gruposPagina = grupos.slice(inicio, inicio + HISTORIAL_PAGE_SIZE)

  return (
    <SectionCard title="Tus cuentas con Serenata" contentClassName="p-0">
      {!grupos.length ? (
        <p className="p-4 md:p-6 text-content text-faint">
          Todavía no tienes cuentas registradas. Cuando Serenata te asigne a un proyecto, aparecerán aquí.
        </p>
      ) : (
        <div className="overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full table-fixed text-[length:var(--text-md)]">
              <colgroup>
                <col style={{ width: '32%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '22%' }} />
              </colgroup>
              <thead>
                <tr className="h-9">
                  {['Proyecto', 'Conceptos', 'Saldo pendiente', 'Estado'].map(h => (
                    <th key={h} className="sn-table-head truncate px-[var(--row-pad-x)] text-left align-middle">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gruposPagina.map(grupo => (
                  <tr key={grupo.id} className="h-[46px] border-b border-hairline last:border-0 odd:bg-row">
                    <td className="truncate px-[var(--row-pad-x)] align-middle text-ink">
                      {grupo.proyecto_nombre || grupo.items[0]?.item_descripcion || 'Proyecto'}
                    </td>
                    <td className="truncate px-[var(--row-pad-x)] align-middle text-subtext">{conceptosDe(grupo)}</td>
                    <td className="truncate px-[var(--row-pad-x)] align-middle font-semibold text-ink">{formatMoney(grupo.saldo_pendiente)}</td>
                    <td className="px-[var(--row-pad-x)] align-middle">
                      <StatusBadge tone={toneForCuentaEstado(grupo.estado)}>{grupo.estado}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-hairline md:hidden">
            {gruposPagina.map(grupo => (
              <div key={grupo.id} className="p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="truncate text-[15px] font-medium text-body">
                    {grupo.proyecto_nombre || grupo.items[0]?.item_descripcion || 'Proyecto'}
                  </p>
                  <StatusBadge tone={toneForCuentaEstado(grupo.estado)} className="flex-shrink-0">{grupo.estado}</StatusBadge>
                </div>
                <p className="mb-3 truncate text-content text-subtext">{conceptosDe(grupo)}</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-lg font-bold text-body">{formatMoney(grupo.saldo_pendiente)}</span>
                  <span className="flex-shrink-0 text-xs text-faint">pendiente</span>
                </div>
              </div>
            ))}
          </div>

          <TableFooter
            shown={gruposPagina.length}
            total={grupos.length}
            unit="cuentas"
            page={paginaActual}
            pageCount={pageCount}
            onPageChange={setPagina}
          />
        </div>
      )}
    </SectionCard>
  )
}
