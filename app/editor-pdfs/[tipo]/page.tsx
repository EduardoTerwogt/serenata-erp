'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { SectionHero } from '@/components/ui/SectionHero'
import { SectionLoading } from '@/components/ui/SectionLoading'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { getJson, sendJson } from '@/lib/client/api'
import { PdfDocumentTypeSchema, PdfTemplateSchema, type PdfElement, type PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'
import { resolveColorToken } from '@/lib/server/pdf/pdf-color-tokens'
import { EditorCanvas } from './EditorCanvas'
import { Inspector } from './Inspector'

interface PdfPlantillaRow {
  active_schema: PdfTemplate
  draft_schema: PdfTemplate | null
}

const LABELS: Record<string, string> = {
  cotizacion: 'Cotización',
  orden_pago: 'Orden de pago',
  hoja_llamado: 'Hoja de llamado',
  reporte_cierre: 'Reporte de cierre',
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export default function EditorPdfTipoPage() {
  const params = useParams<{ tipo: string }>()
  const router = useRouter()
  const tipoResult = PdfDocumentTypeSchema.safeParse(params.tipo)

  const [row, setRow] = useState<PdfPlantillaRow | null | 'loading' | 'not-found' | 'error'>('loading')
  const [template, setTemplate] = useState<PdfTemplate | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [snapGrid, setSnapGrid] = useState(2)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [confirmRestaurar, setConfirmRestaurar] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [migrando, setMigrando] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tipo = tipoResult.success ? tipoResult.data : null

  useEffect(() => {
    if (!tipo) return
    let cancelled = false
    getJson<PdfPlantillaRow | null>(`/api/editor-pdfs/${tipo}`, 'Error obteniendo la plantilla')
      .then(data => {
        if (cancelled) return
        if (!data) {
          setRow('not-found')
          return
        }
        setRow(data)
        setTemplate(data.draft_schema ?? data.active_schema)
      })
      .catch(() => {
        // Bug real encontrado en sesión 2026-09-22 (pruebas de uso reales):
        // un fetch fallido (500, red) caía en el mismo estado que "no
        // migrado" -- mostraba "Migrar este documento" en vez del error
        // real, ocultando problemas genuinos (ej. `pdf_plantillas` sin
        // migrar a producción) detrás de una UI que parecía normal.
        if (!cancelled) setRow('error')
      })
    return () => {
      cancelled = true
    }
  }, [tipo])

  const scheduleAutosave = useCallback(
    (next: PdfTemplate) => {
      if (!tipo) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      setSaveStatus('saving')
      saveTimer.current = setTimeout(async () => {
        const validation = PdfTemplateSchema.safeParse(next)
        if (!validation.success) {
          setSaveStatus('error')
          return
        }
        try {
          await sendJson(`/api/editor-pdfs/${tipo}/draft`, validation.data, 'Error guardando', { method: 'PATCH' })
          setSaveStatus('saved')
        } catch {
          setSaveStatus('error')
        }
      }, 800)
    },
    [tipo]
  )

  function updateTemplate(updater: (t: PdfTemplate) => PdfTemplate) {
    setTemplate(prev => {
      if (!prev) return prev
      const next = updater(prev)
      scheduleAutosave(next)
      return next
    })
  }

  function updateElements(updater: (elements: PdfElement[]) => PdfElement[]) {
    updateTemplate(t => ({ ...t, elements: updater(t.elements) }))
  }

  async function handleAplicar() {
    if (!tipo) return
    setActionError(null)
    try {
      await sendJson(`/api/editor-pdfs/${tipo}/aplicar`, {}, 'Error aplicando el diseño', { method: 'POST' })
      setSaveStatus('idle')
      const fresh = await getJson<PdfPlantillaRow>(`/api/editor-pdfs/${tipo}`, 'Error recargando')
      setRow(fresh)
      setTemplate(fresh.active_schema)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Error aplicando el diseño')
    }
  }

  async function handleDescartar() {
    if (!tipo) return
    setActionError(null)
    try {
      const fresh = await sendJson<PdfPlantillaRow>(`/api/editor-pdfs/${tipo}/draft`, undefined, 'Error descartando', { method: 'DELETE' })
      setRow(fresh)
      setTemplate(fresh.active_schema)
      setSaveStatus('idle')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Error descartando cambios')
    }
  }

  async function handleMigrar() {
    if (!tipo) return
    setActionError(null)
    setMigrando(true)
    try {
      const fresh = await sendJson<PdfPlantillaRow>(`/api/editor-pdfs/${tipo}/migrar`, {}, 'Error migrando el documento', { method: 'POST' })
      setRow(fresh)
      setTemplate(fresh.active_schema)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Error migrando el documento')
    } finally {
      setMigrando(false)
    }
  }

  async function handleRestaurar() {
    if (!tipo) return
    setConfirmRestaurar(false)
    setActionError(null)
    try {
      const fresh = await sendJson<PdfPlantillaRow>(`/api/editor-pdfs/${tipo}/restaurar`, {}, 'Error restaurando', { method: 'POST' })
      setRow(fresh)
      setTemplate(fresh.active_schema)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Error restaurando la plantilla')
    }
  }

  const selectedText = useMemo(() => {
    if (!template) return null
    const el = template.elements.find(e => selectedIds.includes(e.id))
    return el?.type === 'text' ? el.colorToken : null
  }, [template, selectedIds])

  useEffect(() => {
    if (selectedText) {
      try {
        resolveColorToken(selectedText)
      } catch {
        // token inválido -- no rompe la UI, el Inspector lo deja elegir de nuevo
      }
    }
  }, [selectedText])

  if (!tipo) {
    return <p className="text-cancelled-fg">Tipo de documento inválido.</p>
  }

  if (row === 'loading') {
    return <SectionLoading />
  }

  if (row === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <SectionHero title={LABELS[tipo] ?? tipo} />
        <div className="rounded-panel border border-hairline bg-card p-12 text-center">
          <p className="text-lg text-cancelled-fg">
            No se pudo cargar la plantilla. Puede ser un problema temporal de conexión con Supabase —
            reintentá recargando la página.
          </p>
        </div>
      </div>
    )
  }

  if (row === 'not-found') {
    return (
      <div className="flex flex-col gap-4">
        <SectionHero title={LABELS[tipo] ?? tipo} />
        <div className="rounded-panel border border-hairline bg-card p-12 text-center">
          <p className="text-lg text-subtext">
            Este documento todavía no se migró al Editor de PDFs (Bloques 7-9 de docs/PLAN.md).
          </p>
          {actionError && (
            <div className="mt-4 rounded-control bg-cancelled-bg px-4 py-3 text-sm text-cancelled-fg">
              {actionError}
            </div>
          )}
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="ghost" size="md" onClick={() => router.push('/editor-pdfs')}>
              Volver al catálogo
            </Button>
            <Button variant="primary" size="md" onClick={handleMigrar} disabled={migrando}>
              {migrando ? 'Migrando…' : 'Migrar este documento'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!template) return <SectionLoading />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHero title={LABELS[tipo] ?? tipo} />
        <div className="flex items-center gap-2">
          <span className="text-[length:var(--text-sm)] text-subtext">
            {saveStatus === 'saving' && 'Guardando…'}
            {saveStatus === 'saved' && 'Guardado'}
            {saveStatus === 'error' && 'Error al guardar'}
          </span>
          <Button
            variant="ghost"
            size="md"
            onClick={() => window.open(`/api/editor-pdfs/${tipo}/preview`, '_blank')}
          >
            Vista previa
          </Button>
          <Button variant="ghost" size="md" onClick={handleDescartar}>Descartar cambios</Button>
          <Button variant="ghost" size="md" onClick={() => setConfirmRestaurar(true)}>Restaurar plantilla</Button>
          <Button variant="primary" size="md" onClick={handleAplicar}>Aplicar diseño</Button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-control bg-cancelled-bg px-4 py-3 text-sm text-cancelled-fg">{actionError}</div>
      )}

      <div className="flex gap-4 overflow-auto">
        <div className="flex-1 overflow-auto bg-app p-6">
          <EditorCanvas
            template={template}
            selectedIds={selectedIds}
            onSelect={setSelectedIds}
            onChangeElements={updateElements}
            snapGrid={snapGrid}
          />
        </div>
        <Inspector
          template={template}
          selectedIds={selectedIds}
          onSelect={setSelectedIds}
          onChangeElements={updateElements}
          onChangeTemplate={updateTemplate}
          snapGrid={snapGrid}
          onChangeSnapGrid={setSnapGrid}
        />
      </div>

      {confirmRestaurar && (
        <Modal title="Restaurar plantilla" onClose={() => setConfirmRestaurar(false)}>
          <p className="text-body">
            Esto reemplaza el diseño activo por el original de Serenata y descarta cualquier cambio sin aplicar.
            Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="md" onClick={() => setConfirmRestaurar(false)}>Cancelar</Button>
            <Button variant="primary" size="md" onClick={handleRestaurar}>Restaurar</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
