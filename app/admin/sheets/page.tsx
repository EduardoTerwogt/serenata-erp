'use client'

import { useState } from 'react'

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
    <div className="px-5 pt-6 pb-6 md:p-8 max-w-3xl">
      <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">Google Sheets — Sincronización</h1>
      <p className="text-gray-400 mb-8 text-sm">Sincroniza datos entre Supabase y tu Google Sheet de manera bidireccional.</p>

      {/* Sección de instrucciones de setup */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6">
        <h2 className="text-white font-semibold mb-2">Configuración inicial</h2>
        <ol className="text-gray-400 text-sm space-y-1 list-decimal list-inside">
          <li>
            Primero re-autoriza Google con el nuevo scope de Sheets:{' '}
            <a href="/api/integrations/drive/authorize" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 underline">
              Ir a autorizar →
            </a>
          </li>
          <li>Copia el nuevo refresh token y actualiza <code className="bg-gray-800 px-1 rounded text-xs">GOOGLE_DRIVE_REFRESH_TOKEN</code> en Vercel</li>
          <li>Haz click en <strong className="text-white">&quot;Crear Sheet&quot;</strong> abajo para inicializar el spreadsheet</li>
          <li>Copia el <code className="bg-gray-800 px-1 rounded text-xs">spreadsheetId</code> del resultado y agrégalo a Vercel como <code className="bg-gray-800 px-1 rounded text-xs">GOOGLE_SHEETS_SPREADSHEET_ID</code></li>
        </ol>
      </div>

      {/* Botones de acción */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <button
          onClick={() => run('setup')}
          disabled={isLoading}
          className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white px-4 py-3 rounded-lg font-medium text-sm transition-colors flex flex-col items-center gap-1 min-h-[72px] justify-center"
        >
          <span className="text-lg">🗂️</span>
          <span>{isLoading && activeAction === 'setup' ? 'Creando...' : 'Crear Sheet'}</span>
          <span className="text-xs text-orange-200 font-normal">Inicializa el spreadsheet</span>
        </button>

        <button
          onClick={() => run('sync-down')}
          disabled={isLoading}
          className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white px-4 py-3 rounded-lg font-medium text-sm transition-colors flex flex-col items-center gap-1 min-h-[72px] justify-center"
        >
          <span className="text-lg">⬇️</span>
          <span>{isLoading && activeAction === 'sync-down' ? 'Exportando...' : 'Supabase → Sheets'}</span>
          <span className="text-xs text-blue-200 font-normal">Exportar BD al Sheet</span>
        </button>

        <button
          onClick={() => run('sync-up')}
          disabled={isLoading}
          className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-4 py-3 rounded-lg font-medium text-sm transition-colors flex flex-col items-center gap-1 min-h-[72px] justify-center"
        >
          <span className="text-lg">⬆️</span>
          <span>{isLoading && activeAction === 'sync-up' ? 'Importando...' : 'Sheets → Supabase'}</span>
          <span className="text-xs text-green-200 font-normal">Importar Sheet a la BD</span>
        </button>
      </div>

      {/* Estado: cargando */}
      {isLoading && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 text-center text-gray-400 text-sm">
          <div className="inline-block w-5 h-5 border-2 border-gray-500 border-t-orange-400 rounded-full animate-spin mb-2" />
          <p>Procesando... esto puede tomar unos segundos</p>
        </div>
      )}

      {/* Estado: error */}
      {step === 'error' && errorMsg && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-5 py-4 text-sm">
          <p className="font-semibold mb-1">Error</p>
          <p>{errorMsg}</p>
        </div>
      )}

      {/* Estado: resultado */}
      {step === 'done' && result && (
        <div className="bg-green-900/30 border border-green-700 rounded-xl px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-green-300 font-semibold text-sm">Completado</p>
            {sheetUrl && (
              <a
                href={sheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-400 hover:text-green-200 underline text-sm"
              >
                Abrir Sheet →
              </a>
            )}
          </div>

          {getSummaryLine() && (
            <p className="text-gray-300 text-sm mb-3">{getSummaryLine()}</p>
          )}

          {result.spreadsheetId && (
            <div className="bg-gray-900 rounded-lg p-3 mb-3">
              <p className="text-gray-400 text-xs mb-1">SpreadsheetId (agregar a Vercel como <code>GOOGLE_SHEETS_SPREADSHEET_ID</code>):</p>
              <code className="text-orange-300 text-sm break-all">{result.spreadsheetId}</code>
            </div>
          )}

          {getResultsArray().length > 0 && (
            <table className="w-full text-xs text-gray-300 mt-2">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left pb-1">Pestaña</th>
                  <th className="text-right pb-1">Filas</th>
                  <th className="text-right pb-1">Estado</th>
                </tr>
              </thead>
              <tbody>
                {getResultsArray().map((r, i) => (
                  <tr key={i} className="border-b border-gray-800">
                    <td className="py-1">{r.tab}</td>
                    <td className="py-1 text-right">
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
                        <span className="text-green-400">✓</span>
                      ) : (
                        <span className="text-red-400" title={r.error}>✗</span>
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
