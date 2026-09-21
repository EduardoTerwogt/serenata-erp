'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SectionHero } from '@/components/ui/SectionHero'
import { SectionLoading } from '@/components/ui/SectionLoading'
import { Button } from '@/components/ui/Button'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'
import { getJson } from '@/lib/client/api'
import type { PdfDocumentType } from '@/lib/server/pdf/pdf-template-schema'

interface PdfPlantillaRow {
  active_schema: unknown
  draft_schema: unknown
}

const DOCUMENTOS: { tipo: PdfDocumentType; label: string; descripcion: string }[] = [
  { tipo: 'cotizacion', label: 'Cotización', descripcion: 'Header, tabla de partidas agrupada, bloques legales.' },
  { tipo: 'orden_pago', label: 'Orden de pago', descripcion: 'Responsable, datos bancarios, tabla de items por evento.' },
  { tipo: 'hoja_llamado', label: 'Hoja de llamado', descripcion: 'Fecha, locación, tabla de crew y equipo.' },
  { tipo: 'reporte_cierre', label: 'Reporte de cierre', descripcion: 'Tabla financiera cotizado/cobrado/pagado.' },
]

function estadoDe(row: PdfPlantillaRow | null): { label: string; tone: StatusTone } {
  if (!row) return { label: 'No migrado', tone: 'draft' }
  if (row.draft_schema) return { label: 'Cambios sin aplicar', tone: 'issued' }
  return { label: 'Activo', tone: 'approved' }
}

export default function EditorPdfsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Record<PdfDocumentType, PdfPlantillaRow | null> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      setLoading(true)
      setError(null)
      try {
        const results = await Promise.all(
          DOCUMENTOS.map(doc =>
            getJson<PdfPlantillaRow | null>(
              `/api/editor-pdfs/${doc.tipo}`,
              `Error obteniendo ${doc.label}`
            )
          )
        )
        if (cancelled) return
        const byTipo = Object.fromEntries(
          DOCUMENTOS.map((doc, i) => [doc.tipo, results[i]])
        ) as Record<PdfDocumentType, PdfPlantillaRow | null>
        setRows(byTipo)
      } catch (e) {
        if (cancelled) return
        console.error('[editor-pdfs] Error fetching catálogo:', e)
        setError('No se pudo cargar el estado de las plantillas')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchAll()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <SectionHero title="Editor de PDFs" />
      <p className="-mt-4 text-[length:var(--text-md)] text-subtext">
        Personaliza el diseño de los 4 documentos que genera Serenata.
      </p>

      {error && (
        <div className="rounded-control bg-cancelled-bg px-4 py-3 text-sm text-cancelled-fg">{error}</div>
      )}

      {loading ? (
        <SectionLoading />
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {DOCUMENTOS.map(doc => {
            const estado = estadoDe(rows?.[doc.tipo] ?? null)
            return (
              <div key={doc.tipo} className="rounded-panel border border-hairline bg-card flex flex-col min-w-0">
                <div className="p-5 border-b border-hairline flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-h3 font-semibold text-ink leading-snug">{doc.label}</h3>
                    <p className="mt-1.5 text-[length:var(--text-md)] text-subtext leading-snug">
                      {doc.descripcion}
                    </p>
                  </div>
                  <StatusBadge tone={estado.tone}>{estado.label}</StatusBadge>
                </div>

                <div className="flex items-center gap-2 p-4 flex-wrap">
                  <Button variant="secondary" size="md" onClick={() => router.push(`/editor-pdfs/${doc.tipo}`)}>
                    Abrir editor
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
