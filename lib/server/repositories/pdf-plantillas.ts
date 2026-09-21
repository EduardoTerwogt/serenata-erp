import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { PdfDocumentType, PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'
import { buildCotizacionBaseline } from '@/lib/server/pdf/default-templates/cotizacion'

export interface PdfPlantillaRow {
  id: string
  tipo_documento: PdfDocumentType
  active_schema: PdfTemplate
  draft_schema: PdfTemplate | null
  draft_updated_at: string | null
  draft_updated_by: string | null
  applied_at: string | null
  applied_by: string | null
  created_at: string
}

/**
 * Baseline por tipo de documento (docs/PLAN.md, "Diseño activo vs.
 * borrador"): vive en código, se lee solo para copiarla a una fila
 * concreta (nunca como referencia viva). La reconstrucción real del PDF
 * actual como schema es trabajo de los Bloques 7-9 (uno por documento,
 * empezando por Cotización, Bloque 7 -- cerrado). Orden de pago, Hoja de
 * llamado y Reporte de cierre siguen en los Bloques 8-9.
 */
function getBaselineTemplate(tipo: PdfDocumentType): PdfTemplate {
  if (tipo === 'cotizacion') return buildCotizacionBaseline()
  throw new Error(
    `El documento "${tipo}" todavía no tiene una plantilla baseline (se migra en los Bloques 8-9 de docs/PLAN.md).`
  )
}

export const PdfPlantillasRepository = {
  async getByTipo(tipo: PdfDocumentType): Promise<PdfPlantillaRow | null> {
    const { data, error } = await supabaseAdmin
      .from('pdf_plantillas')
      .select('*')
      .eq('tipo_documento', tipo)
      .maybeSingle()

    if (error) {
      console.error('[pdf-plantillas] Error fetching by tipo:', error)
      throw new Error('Failed to fetch pdf_plantillas')
    }

    return data
  },

  /** Autosave: nunca toca `active_schema`. */
  async saveDraft(tipo: PdfDocumentType, draft: PdfTemplate, userId: string): Promise<PdfPlantillaRow> {
    const { data, error } = await supabaseAdmin
      .from('pdf_plantillas')
      .update({
        draft_schema: draft,
        draft_updated_at: new Date().toISOString(),
        draft_updated_by: userId,
      })
      .eq('tipo_documento', tipo)
      .select()
      .single()

    if (error) {
      console.error('[pdf-plantillas] Error saving draft:', error)
      throw new Error('Failed to save draft')
    }

    return data
  },

  /** Descartar cambios: vuelve al diseño actualmente aplicado. */
  async discardDraft(tipo: PdfDocumentType): Promise<PdfPlantillaRow> {
    const { data, error } = await supabaseAdmin
      .from('pdf_plantillas')
      .update({ draft_schema: null, draft_updated_at: null, draft_updated_by: null })
      .eq('tipo_documento', tipo)
      .select()
      .single()

    if (error) {
      console.error('[pdf-plantillas] Error discarding draft:', error)
      throw new Error('Failed to discard draft')
    }

    return data
  },

  /**
   * Aplicar diseño: `active_schema = draft_schema`, `draft_schema = null`.
   * El llamador ya validó el schema con Zod antes de llegar acá (mismo
   * pipeline que la vista previa) -- ver `docs/PLAN.md` "Seguridad del
   * schema y pipeline único preview/aplicar".
   */
  async aplicar(tipo: PdfDocumentType, draft: PdfTemplate, userId: string): Promise<PdfPlantillaRow> {
    const now = new Date().toISOString()
    const { data, error } = await supabaseAdmin
      .from('pdf_plantillas')
      .update({
        active_schema: draft,
        draft_schema: null,
        draft_updated_at: null,
        draft_updated_by: null,
        applied_at: now,
        applied_by: userId,
      })
      .eq('tipo_documento', tipo)
      .select()
      .single()

    if (error) {
      console.error('[pdf-plantillas] Error aplicando diseño:', error)
      throw new Error('Failed to aplicar diseño')
    }

    return data
  },

  /**
   * Migrar: primera vez que un documento pasa del generador hardcodeado
   * viejo al Editor de PDFs (docs/PLAN.md, Bloques 7-9) -- crea la fila que
   * `restaurar`/`aplicar`/`saveDraft` (todas `UPDATE ... WHERE
   * tipo_documento`) requieren y que todavía no existe. Copia concreta del
   * baseline de código, igual que `restaurar` -- nunca una referencia viva.
   */
  async migrar(tipo: PdfDocumentType, userId: string): Promise<PdfPlantillaRow> {
    const baseline = getBaselineTemplate(tipo)
    const now = new Date().toISOString()
    const { data, error } = await supabaseAdmin
      .from('pdf_plantillas')
      .insert({ tipo_documento: tipo, active_schema: baseline, applied_at: now, applied_by: userId })
      .select()
      .single()

    if (error) {
      console.error('[pdf-plantillas] Error migrando documento:', error)
      throw new Error('Failed to migrar documento')
    }

    return data
  },

  /**
   * Restaurar plantilla: pierde cualquier customización -- escribe una
   * copia concreta del baseline de código en `active_schema`, nunca una
   * referencia viva.
   */
  async restaurar(tipo: PdfDocumentType, userId: string): Promise<PdfPlantillaRow> {
    const baseline = getBaselineTemplate(tipo)
    const now = new Date().toISOString()
    const { data, error } = await supabaseAdmin
      .from('pdf_plantillas')
      .update({
        active_schema: baseline,
        draft_schema: null,
        draft_updated_at: null,
        draft_updated_by: null,
        applied_at: now,
        applied_by: userId,
      })
      .eq('tipo_documento', tipo)
      .select()
      .single()

    if (error) {
      console.error('[pdf-plantillas] Error restaurando plantilla:', error)
      throw new Error('Failed to restaurar plantilla')
    }

    return data
  },
}
