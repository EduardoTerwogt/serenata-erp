'use client'

import { useState } from 'react'
import { SectionHero } from '@/components/ui/SectionHero'
import { Icon } from '@/components/ui/Icon'

interface SyncResult {
  tab: string
  rows?: number
  inserted?: number
  updated?: number
  deleted?: number
  errors?: number
  ok: boolean
  error?: string
}

interface SyncSummary {
  spreadsheetId?: string
  url?: string
  message?: string
  totalRows?: number
  totalInserted?: number
  totalUpdated?: number
  totalDeleted?: number
  totalErrors?: number
  errors?: number
  results?: SyncResult[]
  syncSummary?: { results?: SyncResult[]; totalRows?: number; errors?: number }
}

type Step = 'idle' | 'loading' | 'done' | 'error'

export default function SheetsSyncPage() {
  const [step, setStep] = useState<Step>('idle')
  const [result, setResult] = useState<SyncSummary | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [activeAction, setActiveAction] = useState<string | null>(null)

  const run = async (action: 'setup' | 'sync-down' | 'sync-up') => {
    setStep('loading')
    setActiveAction(action)
    setResult(null)
    setErrorMsg(null)

    try {
      const res = await fetch(`/api/integrations/sheets/${action}`, { method: 'POST' })
      const text = await res.text()
      let data: Record<string, unknown> = {}
      try { data = text ? JSON.parse(text) : {} } catch { data = { error: text || `Error HTTP ${res.status}` } }

      if (!res.ok) {
        setStep('error')
        setErrorMsg((data?.error as string) ?? `Error HTTP ${res.status}`)
        return
      }

      setResult(data as SyncSummary)
      setStep('done')
    } catch (e: unknown) {
      setStep('error')
      setErrorMsg(e instanceof Error ? e.message : 'Error inesperado')
    } finally {
      setActiveAction(null)
    }
  }

  const isLoading = step === 'loading'
  const sheetUrl = result?.url

  const getResultsArray = (): SyncResult[] => {
    if (!result) return []
    if (result.results) return result.results
    if (result.syncSummary?.results) return result.syncSummary.results
    return []
  }

  const getSummaryLine = (): string => {
    if (!result) return ''
    if (result.message) return result.message
    if (result.totalRows !== undefined) return `${result.totalRows} filas sincronizadas`
    if (result.totalInserted !== undefined || result.totalUpdated !== undefined) {
      const parts = [`+${result.totalInserted ?? 0} insertados`, `~${result.totalUpdated ?? 0} actualizados`]
      if ((result.totalDeleted ?? 0) > 0) parts.push(`-${result.totalDeleted} borrados`)
      parts.push(`${result.totalErrors ?? 0} errores`)
      return parts.join(', ')
    }
    if (result.syncSummary) {
      return `${result.syncSummary.totalRows ?? 0} filas escritas, ${result.syncSummary.errors ?? 0} errores`
    }
    return ''
  }

  return (
    <div className="flex max-w-3xl flex-col gap-[19px]">
      <SectionHero title="Google Sheets" />

      <div className="rounded-panel border border-hairline bg-card p-5">
        <h2 className="mb-2 font-semibold text-ink">Configuración inicial</h2>
        <ol className="list-inside list-decimal space-y-1 text-content text-subtext">
          <li>
            Primero re-autoriza Google con el nuevo scope de Sheets:{' '}
            <a href="/api/integrations/drive/authorize" target="_blank" rel="noopener noreferrer" className="text-accent underline hover:text-accent-pressed">
              Ir a autorizar →
            </a>
          </li>
          <li>Copia el nuevo refresh token y actualiza <code className="rounded bg-row px-1 text-xs">GOOGLE_DRIVE_REFRESH_TOKEN</code> en Vercel</li>
          <li>Haz click en <strong className="text-ink">&quot;Crear Sheet&quot;</strong> abajo para inicializar el spreadsheet</li>
          <li>Copia el <code className="rounded bg-row px-1 text-xs">spreadsheetId</code> del resultado y agrégalo a Vercel como <code className="rounded bg-row px-1 text-xs">GOOGLE_SHEETS_SPREADSHEET_ID</code></li>
        </ol>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          onClick={() => run('setup')}
          disabled={isLoading}
          className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-panel border border-hairline bg-card px-4 py-3 text-content font-medium text-body transition-colors duration-[var(--dur-fast)] hover:bg-row-alt disabled:opacity-50"
        >
          <Icon name="google-sheets" size={18} className="text-accent" />
          <span>{isLoading && activeAction === 'setup' ? 'Creando...' : 'Crear Sheet'}</span>
          <span className="text-xs font-normal text-faint">Inicializa el spreadsheet</span>
        </button>

        <button
          onClick={() => run('sync-down')}
          disabled={isLoading}
          className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-panel border border-hairline bg-card px-4 py-3 text-content font-medium text-body transition-colors duration-[var(--dur-fast)] hover:bg-row-alt disabled:opacity-50"
        >
          <Icon name="download" size={18} className="text-issued-fg" />
          <span>{isLoading && activeAction === 'sync-down' ? 'Exportando...' : 'Supabase → Sheets'}</span>
          <span className="text-xs font-normal text-faint">Exportar BD al Sheet</span>
        </button>

        <button
          onClick={() => run('sync-up')}
          disabled={isLoading}
          className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-panel border border-hairline bg-card px-4 py-3 text-content font-medium text-body transition-colors duration-[var(--dur-fast)] hover:bg-row-alt disabled:opacity-50"
        >
          <Icon name="upload" size={18} className="text-approved-fg" />
          <span>{isLoading && activeAction === 'sync-up' ? 'Importando...' : 'Sheets → Supabase'}</span>
          <span className="text-xs font-normal text-faint">Importar Sheet a la BD</span>
        </button>
      </div>

      {isLoading && (
        <div className="rounded-panel border border-hairline bg-card p-5 text-center text-content text-subtext">
          <Icon name="loader" size={20} className="mx-auto mb-2 animate-spin text-accent" />
          <p>Procesando... esto puede tomar unos segundos</p>
        </div>
      )}

      {step === 'error' && errorMsg && (
        <div className="rounded-panel bg-cancelled-bg px-5 py-4 text-content text-cancelled-fg">
          <p className="mb-1 font-semibold">Error</p>
          <p>{errorMsg}</p>
        </div>
      )}

      {step === 'done' && result && (
        <div className="rounded-panel bg-approved-bg px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold text-content text-approved-fg">Completado</p>
            {sheetUrl && (
              <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="text-content text-approved-fg underline hover:opacity-80">
                Abrir Sheet →
              </a>
            )}
          </div>

          {getSummaryLine() && (
            <p className="mb-3 text-content text-body">{getSummaryLine()}</p>
          )}

          {result.spreadsheetId && (
            <div className="mb-3 rounded-control bg-card p-3">
              <p className="mb-1 text-xs text-subtext">SpreadsheetId (agregar a Vercel como <code>GOOGLE_SHEETS_SPREADSHEET_ID</code>):</p>
              <code className="break-all text-content text-accent">{result.spreadsheetId}</code>
            </div>
          )}

          {getResultsArray().length > 0 && (
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="pb-1 text-left sn-label">Pestaña</th>
                  <th className="pb-1 text-right sn-label">Filas</th>
                  <th className="pb-1 text-right sn-label">Estado</th>
                </tr>
              </thead>
              <tbody>
                {getResultsArray().map((r, i) => (
                  <tr key={i} className="border-b border-hairline odd:bg-row">
                    <td className="py-1 text-body">{r.tab}</td>
                    <td className="py-1 text-right text-body">
                      {r.rows !== undefined
                        ? r.rows
                        : [
                            `+${r.inserted ?? 0}`,
                            `~${r.updated ?? 0}`,
                            (r.deleted ?? 0) > 0 ? `-${r.deleted}` : null,
                          ].filter(Boolean).join(' ')
                      }
                    </td>
                    <td className="py-1 text-right">
                      {r.ok ? (
                        <Icon name="check" size={13} className="ml-auto text-approved-fg" />
                      ) : (
                        <Icon name="close" size={13} className="ml-auto text-cancelled-fg" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
