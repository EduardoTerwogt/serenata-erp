'use client'

import { useCallback, useEffect, useState } from 'react'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { Button } from '@/components/ui/Button'
import { SectionLoading } from '@/components/ui/SectionLoading'
import { ResponsiveTableCard } from '@/components/ResponsiveTableCard'
import type { GuardaAuditoria, ResultadoAuditoria } from '@/lib/shared/auditoria'

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' })
}

function Estado({ g }: { g: GuardaAuditoria }) {
  return <StatusBadge tone={g.violaciones === 0 ? 'approved' : 'cancelled'}>{g.violaciones === 0 ? 'En orden' : `${g.violaciones} con falla`}</StatusBadge>
}

/** B7 (F9): resultado de `auditar_consistencia()`; el cron diario corre las mismas guardas. */
export function AdminAuditoria() {
  const [resultado, setResultado] = useState<ResultadoAuditoria | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const ejecutar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/auditoria')
      if (!res.ok) throw new Error('No se pudo ejecutar la auditoría')
      setResultado(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void ejecutar() }, [ejecutar])

  const conFalla = resultado?.guardas.filter((g) => g.violaciones > 0) ?? []

  return (
    <SectionCard
      title="Consistencia de datos"
      description="Guardas permanentes del modelo (dinero, conceptos, folios). Se ejecutan también cada día."
      borderedHeader
      actions={<Button variant="secondary" size="md" onClick={() => void ejecutar()} disabled={loading}>Volver a ejecutar</Button>}
    >
      {error && <StatusBanner tone="error" className="m-4 md:m-6">{error}</StatusBanner>}
      {loading && !resultado ? (
        <SectionLoading className="min-h-[160px]" />
      ) : resultado && (
        <>
          <div className="px-4 pt-4 md:px-6">
            <StatusBanner tone={conFalla.length === 0 ? 'success' : 'error'}>
              {conFalla.length === 0
                ? 'Todas las guardas en orden.'
                : `${resultado.total_violaciones} fila(s) con falla en ${conFalla.length} guarda(s). Revisa los ejemplos y corrige antes de seguir operando.`}
              <span className="ml-2 text-[length:var(--text-xs)] opacity-80">Última ejecución: {formatoFecha(resultado.ejecutado_en)}</span>
            </StatusBanner>
          </div>
          <ResponsiveTableCard<GuardaAuditoria>
            data={resultado.guardas}
            keyExtractor={(g) => g.clave}
            emptyMessage="Sin guardas."
            columns={[
              { key: 'guarda', label: 'Guarda', width: '50%' },
              { key: 'estado', label: 'Estado', width: '18%' },
              { key: 'ejemplos', label: 'Ejemplos (ids)', width: '32%' },
            ]}
            renderDesktopRow={(g) => (
              <>
                <td className="px-[var(--row-pad-x)] align-middle text-ink">{g.descripcion}</td>
                <td className="px-[var(--row-pad-x)] align-middle"><Estado g={g} /></td>
                <td className="truncate px-[var(--row-pad-x)] align-middle font-mono text-[length:var(--text-xs)] text-subtext">
                  {g.ejemplos.length === 0 ? '—' : g.ejemplos.join(', ')}
                </td>
              </>
            )}
            renderMobileCard={(g) => (
              <div className="rounded-card border border-hairline bg-row p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-ink">{g.descripcion}</span>
                  <Estado g={g} />
                </div>
                {g.ejemplos.length > 0 && (
                  <p className="break-all font-mono text-[length:var(--text-xs)] text-subtext">{g.ejemplos.join(', ')}</p>
                )}
              </div>
            )}
          />
        </>
      )}
    </SectionCard>
  )
}
