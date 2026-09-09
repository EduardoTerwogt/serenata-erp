'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getJson, sendJson, sendFormData } from '@/lib/client/api'
import { SectionHero } from '@/components/ui/SectionHero'
import { SectionCard } from '@/components/ui/SectionCard'
import { FilterTabs, type FilterTab } from '@/components/ui/FilterTabs'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { StatusBadge, toneForCuentaEstado, toneForValidacionEstado } from '@/components/ui/StatusBadge'
import { SectionLoading } from '@/components/ui/SectionLoading'
import type { ProveedorDocumento, TipoDocumentoProveedor } from '@/lib/types'

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
  telefono: string | null
  banco: string | null
  clabe: string | null
  regimen_fiscal: 'moral' | 'fisica' | null
}

interface CuentaPortal {
  id: string
  proyecto_nombre: string | null
  item_descripcion: string | null
  x_pagar: number
  estado: string
  saldo_pendiente: number
}

interface EjemploFactura {
  subtotal: number
  iva_trasladado: number
  iva_retenido: number
  isr_retenido: number
  total: number
  explicacion: string
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
  const [cuentas, setCuentas] = useState<CuentaPortal[]>([])

  const cargarTodo = () => {
    Promise.all([
      getJson<PerfilResponse>('/api/portal/perfil', 'Error al cargar tu perfil'),
      getJson<{ documentos: ProveedorDocumento[] }>('/api/portal/documentos', 'Error al cargar tus documentos'),
      getJson<{ cuentas: CuentaPortal[] }>('/api/portal/cuentas', 'Error al cargar tus cuentas'),
    ]).then(([perfilRes, documentosRes, cuentasRes]) => {
      setPerfil(perfilRes)
      setDocumentos(documentosRes.documentos)
      setCuentas(cuentasRes.cuentas)
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

      {tab === 'cuentas' && <TabCuentas cuentas={cuentas} />}
    </div>
  )
}

function TabDatos({ perfil, correo, onGuardado }: { perfil: PerfilResponse; correo: string | null; onGuardado: () => void }) {
  const [nombre, setNombre] = useState(perfil.nombre)
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
      await sendJson('/api/portal/perfil', { nombre, telefono, banco, clabe }, 'Error al guardar', { method: 'PATCH' })
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
        <div>
          <label className="block text-content font-medium text-body mb-1">Nombre completo o alias</label>
          <input
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-content font-medium text-body mb-1">Teléfono</label>
          <input
            type="tel"
            value={telefono}
            onChange={e => setTelefono(e.target.value)}
            className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-content font-medium text-body mb-1">Correo</label>
          <input
            type="email"
            value={correo ?? ''}
            disabled
            className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-faint"
          />
        </div>
      </SectionCard>

      <SectionCard title="Datos bancarios y fiscales" contentClassName="p-4 md:p-6 space-y-4">
        <div>
          <label className="block text-content font-medium text-body mb-1">Banco</label>
          <input
            type="text"
            value={banco}
            onChange={e => setBanco(e.target.value)}
            className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-content font-medium text-body mb-1">CLABE · 18 dígitos</label>
          <input
            type="text"
            value={clabe}
            onChange={e => setClabe(e.target.value)}
            maxLength={18}
            className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-content font-medium text-body mb-1">Régimen fiscal</label>
          <p className="text-content text-body">
            {perfil.regimen_fiscal === 'fisica'
              ? 'Persona física con honorarios'
              : perfil.regimen_fiscal === 'moral'
                ? 'Persona moral'
                : 'Se detecta automáticamente al subir tu constancia de situación fiscal'}
          </p>
        </div>

        {error && <StatusBanner tone="error">{error}</StatusBanner>}
        {success && <StatusBanner tone="success">Guardado</StatusBanner>}

        <button
          type="submit"
          disabled={guardando}
          className="w-full bg-accent hover:bg-accent-pressed text-accent-ink py-2.5 rounded-control font-medium transition-colors disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
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
                <p className="text-xs text-faint truncate mt-0.5">{existentes[0].archivo_nombre}</p>
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

function TabCuentas({ cuentas }: { cuentas: CuentaPortal[] }) {
  const [cuentaId, setCuentaId] = useState('')
  const [xml, setXml] = useState<File | null>(null)
  const [pdf, setPdf] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ejemplo, setEjemplo] = useState<EjemploFactura | null>(null)
  const [success, setSuccess] = useState(false)

  const cuentasFacturables = cuentas.filter(c => c.estado !== 'PAGADO')

  const subirFactura = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cuentaId) {
      setError('Selecciona a qué cuenta corresponde tu factura')
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
      const response = await fetch(`/api/portal/cuentas/${cuentaId}/factura`, { method: 'POST', body: formData })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'Error al subir tu factura')
        if (data.ejemplo) setEjemplo(data.ejemplo)
        return
      }
      setSuccess(true)
    } catch {
      setError('Error al subir tu factura')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="grid gap-[19px] items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
      <SectionCard title="Subir factura" contentClassName="p-4 md:p-6 space-y-4">
        <form onSubmit={subirFactura} className="space-y-4">
          <div>
            <label className="block text-content font-medium text-body mb-1">Cuenta a la que corresponde</label>
            <select
              value={cuentaId}
              onChange={e => setCuentaId(e.target.value)}
              className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
            >
              <option value="">Selecciona una cuenta...</option>
              {cuentasFacturables.map(c => (
                <option key={c.id} value={c.id}>
                  {(c.proyecto_nombre || c.item_descripcion || 'Proyecto')} · {formatMoney(c.x_pagar)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-content font-medium text-body mb-1">Archivo XML</label>
            <input
              type="file"
              accept="text/xml,application/xml,.xml"
              onChange={e => setXml(e.target.files?.[0] ?? null)}
              className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body file:mr-3 file:rounded-control file:border-0 file:bg-row file:px-3 file:py-1.5 file:text-body"
            />
          </div>
          <div>
            <label className="block text-content font-medium text-body mb-1">Archivo PDF</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={e => setPdf(e.target.files?.[0] ?? null)}
              className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body file:mr-3 file:rounded-control file:border-0 file:bg-row file:px-3 file:py-1.5 file:text-body"
            />
          </div>

          {error && <StatusBanner tone="error">{error}</StatusBanner>}
          {success && <StatusBanner tone="success">Tu factura se subió correctamente. Serenata la revisará para procesar tu pago.</StatusBanner>}

          {ejemplo && (
            <div className="rounded-control border border-hairline bg-row p-3.5">
              <p className="text-content font-medium text-body mb-2">Así debe quedar tu factura:</p>
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
              <p className="mt-3 text-content text-faint">{ejemplo.explicacion}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={subiendo}
            className="w-full bg-accent hover:bg-accent-pressed text-accent-ink py-2.5 rounded-control font-medium transition-colors disabled:opacity-50"
          >
            {subiendo ? 'Subiendo...' : 'Validar y subir factura'}
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Tus cuentas con Serenata" contentClassName="p-0">
        {!cuentas.length ? (
          <p className="p-4 md:p-6 text-content text-faint">
            Todavía no tienes cuentas registradas. Cuando Serenata te asigne a un proyecto, aparecerán aquí.
          </p>
        ) : (
          cuentas.map((cuenta, i) => (
            <div
              key={cuenta.id}
              className={`flex items-center justify-between gap-3 p-4 md:px-6 ${i === cuentas.length - 1 ? '' : 'border-b border-hairline'}`}
            >
              <div className="min-w-0">
                <p className="text-body font-medium truncate">{cuenta.proyecto_nombre || cuenta.item_descripcion || 'Proyecto'}</p>
                <p className="text-content text-subtext truncate">{cuenta.item_descripcion}</p>
              </div>
              <div className="flex-none text-right">
                <StatusBadge tone={toneForCuentaEstado(cuenta.estado)}>{cuenta.estado}</StatusBadge>
                <p className="mt-1 text-content text-body">{formatMoney(cuenta.saldo_pendiente)} pendiente</p>
              </div>
            </div>
          ))
        )}
      </SectionCard>
    </div>
  )
}
