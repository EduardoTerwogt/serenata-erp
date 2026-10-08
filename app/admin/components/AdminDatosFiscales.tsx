'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { SectionCard } from '@/components/ui/SectionCard'
import { SectionLoading } from '@/components/ui/SectionLoading'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { getJson, sendFormData } from '@/lib/client/api'
import type { DatosConstancia, ValidacionConstancia } from '@/lib/server/cuentas/constancia-serenata'
import type { DatosFiscalesSerenata } from '@/lib/server/cuentas/datos-fiscales'

const INPUT = 'w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent'
const LABEL = 'sn-label block mb-1.5'

const fecha = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' })

interface Lectura {
  archivo: File
  datos: { rfc: string; razon_social: string; regimen_fiscal: string; codigo_postal: string }
  validacion: ValidacionConstancia
}

/**
 * #123 (B6a): datos fiscales de Serenata desde su Constancia de Situación Fiscal. Se sube el PDF, se leen y validan RFC,
 * razón social y régimen (igual que con proveedores), el administrador revisa y confirma lo leído, y de ahí se cargan.
 * Nada va hardcodeado ni en una variable de entorno: sin constancia, las rutas de factura de Cuentas fallan explícito.
 */
export function AdminDatosFiscales() {
  const [vigente, setVigente] = useState<DatosFiscalesSerenata | null>(null)
  const [historial, setHistorial] = useState<DatosFiscalesSerenata[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [confirmado, setConfirmado] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const r = await getJson<{ vigente: DatosFiscalesSerenata | null; historial: DatosFiscalesSerenata[] }>('/api/admin/datos-fiscales', 'No se pudieron cargar los datos fiscales')
      setVigente(r.vigente)
      setHistorial(r.historial)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos fiscales')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const elegirArchivo = async (archivo: File) => {
    setError(null)
    setExito(null)
    setLeyendo(true)
    setConfirmado(false)
    try {
      const fd = new FormData()
      fd.set('constancia', archivo)
      const r = await sendFormData<{ datos: DatosConstancia; validacion: ValidacionConstancia }>('/api/admin/datos-fiscales/leer', fd, 'No se pudo leer la constancia')
      setLectura({
        archivo,
        datos: { rfc: r.datos.rfc ?? '', razon_social: r.datos.razon_social ?? '', regimen_fiscal: r.datos.regimen_fiscal ?? '', codigo_postal: r.datos.codigo_postal ?? '' },
        validacion: r.validacion,
      })
    } catch (e) {
      setLectura(null)
      setError(e instanceof Error ? e.message : 'No se pudo leer la constancia')
    } finally {
      setLeyendo(false)
    }
  }

  // Al corregir un campo a mano la validación se recalcula en el servidor al guardar; aquí solo se limpia la confirmación.
  const editar = (campo: keyof Lectura['datos'], valor: string) => {
    setConfirmado(false)
    setLectura((l) => (l ? { ...l, datos: { ...l.datos, [campo]: valor } } : l))
  }

  const guardar = async () => {
    if (!lectura || !confirmado) return
    setGuardando(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('constancia', lectura.archivo)
      fd.set(
        'datos',
        JSON.stringify({
          rfc: lectura.datos.rfc,
          razon_social: lectura.datos.razon_social,
          regimen_fiscal: lectura.datos.regimen_fiscal || null,
          codigo_postal: lectura.datos.codigo_postal || null,
          confirmado: true,
        })
      )
      const r = await sendFormData<{ advertencias?: string[] }>('/api/admin/datos-fiscales', fd, 'No se pudo guardar la constancia')
      setLectura(null)
      setConfirmado(false)
      setExito(['Constancia guardada. Desde ahora Cuentas reconoce las facturas con este RFC.', ...(r.advertencias ?? [])].join(' '))
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la constancia')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <SectionCard
      title="Datos fiscales de Serenata"
      description="Constancia de Situación Fiscal: de aquí sale el RFC con el que Cuentas decide si un XML es de un cliente o de un proveedor."
      borderedHeader
      actions={
        <>
          <input
            ref={input}
            type="file"
            hidden
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void elegirArchivo(f)
            }}
          />
          <Button variant="secondary" size="md" iconLeft="upload" onClick={() => input.current?.click()} disabled={leyendo || guardando}>
            {leyendo ? 'Leyendo…' : vigente ? 'Subir constancia nueva' : 'Subir constancia'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 p-4 md:p-6">
        {error && <StatusBanner tone="error">{error}</StatusBanner>}
        {exito && <StatusBanner tone="success">{exito}</StatusBanner>}
        {cargando && !vigente && <SectionLoading className="min-h-[120px]" />}

        {!cargando && !vigente && !lectura && (
          <StatusBanner tone="error">
            Todavía no hay constancia cargada: sin ella no se pueden subir facturas en Cuentas. Sube la Constancia de Situación Fiscal de Serenata (PDF).
          </StatusBanner>
        )}

        {lectura && (
          <div className="flex flex-col gap-4 rounded-panel border border-hairline p-4">
            <div className="text-[13px] font-semibold text-ink">Revisa lo leído de {lectura.archivo.name}</div>
            {lectura.validacion.errores.length > 0 && <StatusBanner tone="error">{lectura.validacion.errores.join(' ')}</StatusBanner>}
            {lectura.validacion.advertencias.length > 0 && <StatusBanner tone="info">{lectura.validacion.advertencias.join(' ')}</StatusBanner>}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="df-rfc">RFC</label>
                <input id="df-rfc" value={lectura.datos.rfc} onChange={(e) => editar('rfc', e.target.value.toUpperCase())} className={`${INPUT} font-mono uppercase`} maxLength={13} />
              </div>
              <div>
                <label className={LABEL} htmlFor="df-cp">Código postal</label>
                <input id="df-cp" value={lectura.datos.codigo_postal} onChange={(e) => editar('codigo_postal', e.target.value)} className={INPUT} maxLength={5} inputMode="numeric" />
              </div>
              <div className="md:col-span-2">
                <label className={LABEL} htmlFor="df-razon">Razón social</label>
                <input id="df-razon" value={lectura.datos.razon_social} onChange={(e) => editar('razon_social', e.target.value)} className={INPUT} />
              </div>
              <div className="md:col-span-2">
                <label className={LABEL} htmlFor="df-regimen">Régimen fiscal</label>
                <input id="df-regimen" value={lectura.datos.regimen_fiscal} onChange={(e) => editar('regimen_fiscal', e.target.value)} className={INPUT} />
              </div>
            </div>
            <label className="flex items-center gap-2.5 text-[12.5px] text-body">
              <Checkbox checked={confirmado} onChange={setConfirmado} label="Confirmo que los datos coinciden con la constancia" />
              Confirmo que estos datos coinciden con la constancia
            </label>
            <div className="flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => { setLectura(null); setConfirmado(false) }} disabled={guardando}>
                Cancelar
              </Button>
              <Button iconLeft="check" onClick={guardar} disabled={!confirmado || guardando || !lectura.datos.rfc.trim() || !lectura.datos.razon_social.trim()}>
                {guardando ? 'Guardando…' : 'Guardar constancia'}
              </Button>
            </div>
          </div>
        )}

        {vigente && (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-4" aria-label="Constancia vigente">
            <Dato k="RFC" v={<span className="font-mono">{vigente.rfc}</span>} />
            <Dato k="Razón social" v={vigente.razon_social} />
            <Dato k="Persona" v={vigente.tipo_persona === 'moral' ? 'Persona moral' : 'Persona física'} />
            <Dato k="Código postal" v={vigente.codigo_postal} />
            <div className="md:col-span-2"><Dato k="Régimen fiscal" v={vigente.regimen_fiscal} /></div>
            <Dato k="Cargada" v={`${fecha(vigente.created_at)}${vigente.actualizado_por ? ` · ${vigente.actualizado_por}` : ''}`} />
            <Dato k="Archivo" v={vigente.constancia_url ? <a href={vigente.constancia_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">{vigente.constancia_nombre ?? 'Ver constancia'}</a> : null} />
          </dl>
        )}

        {historial.filter((h) => !h.vigente).length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="sn-caption">Historial</span>
            <ul className="overflow-hidden rounded-panel border border-hairline">
              {historial.filter((h) => !h.vigente).map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline px-3.5 py-2.5 text-[12.5px] first:border-t-0">
                  <span className="font-mono text-ink">{h.rfc}</span>
                  <span className="min-w-0 flex-1 truncate text-subtext">{h.razon_social}</span>
                  <StatusBadge tone="draft">Anterior</StatusBadge>
                  <span className="text-subtext">{fecha(h.created_at)}</span>
                  {h.constancia_url && <a href={h.constancia_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">Ver</a>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </SectionCard>
  )
}

function Dato({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-subtext">{k}</dt>
      <dd className="truncate text-[13px] text-ink">{v || '—'}</dd>
    </div>
  )
}
