'use client'

import { useState } from 'react'
import { SectionCard } from '@/components/ui/SectionCard'
import { Button } from '@/components/ui/Button'
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
  // EF-3 3C-3: presente solo en la respuesta de sync-down, protegida por el
  // lock -- 'error' cuando alguna tabla falló (sincronización parcial),
  // distinto del verde de éxito aunque la request en sí haya respondido 200.
  state?: 'idle' | 'running' | 'error'
}

type Step = 'idle' | 'loading' | 'done' | 'error'
type Action = 'setup' | 'sync-down' | 'sync-up'

const ACCIONES: { id: Action; label: string; nota: string; icon: 'google-sheets' | 'upload' | 'download'; variant: 'secondary' | 'primary' }[] = [
  { id: 'setup', label: 'Crear Sheet', nota: 'Inicializa el spreadsheet.', icon: 'google-sheets', variant: 'secondary' },
  { id: 'sync-down', label: 'Supabase → Sheets', nota: 'Exporta la base de datos al Sheet.', icon: 'upload', variant: 'primary' },
  { id: 'sync-up', label: 'Sheets → Supabase', nota: 'Importa al sistema los cambios hechos en el Sheet.', icon: 'download', variant: 'primary' },
]

// 10 · Admin · Google Sheets (AdminScreen.jsx del kit, función Sincronizacion):
// dos columnas -- Configuración inicial a la izquierda, Acciones + Resultado
// a la derecha. Los pasos reales (con el link de reautorización y los nombres
// de variables de entorno) sustituyen a los pasos estáticos del kit, que no
// tenía lógica real detrás.
export function AdminSheets() {
  const [step, setStep] = useState<Step>('idle')
  const [result, setResult] = useState<SyncSummary | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [activeAction, setActiveAction] = useState<Action | null>(null)

  const run = async (action: Action) => {
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

  const totales = getResultsArray().reduce(
    (a, r) => ({
      insertadas: a.insertadas + (r.inserted ?? 0),
      actualizadas: a.actualizadas + (r.updated ?? 0),
      borradas: a.borradas + (r.deleted ?? 0),
      errores: a.errores + (r.errors ?? 0),
    }),
    { insertadas: 0, actualizadas: 0, borradas: 0, errores: 0 }
  )
  const hayTotales = getResultsArray().some(r => r.inserted !== undefined || r.updated !== undefined)

  return (
    <div className="grid grid-cols-1 items-start gap-[19px] lg:grid-cols-2">
      <SectionCard title="Configuración inicial" borderedHeader contentClassName="p-5">
        <ol className="list-inside list-decimal space-y-2.5 text-[length:var(--text-base)] leading-[var(--lh-body)] text-subtext">
          <li>
            Reautoriza Google con el scope de Sheets:{' '}
            <a href="/api/integrations/drive/authorize" target="_blank" rel="noopener noreferrer" className="text-accent underline hover:text-accent-pressed">
              Ir a autorizar
            </a>
          </li>
          <li>Copia el nuevo refresh token y actualiza <code className="rounded bg-row px-1 text-[length:var(--text-xs)]">GOOGLE_DRIVE_REFRESH_TOKEN</code> en Vercel</li>
          <li>Haz click en <strong className="text-ink">&quot;Crear Sheet&quot;</strong> para inicializar el spreadsheet</li>
          <li>Copia el <code className="rounded bg-row px-1 text-[length:var(--text-xs)]">spreadsheetId</code> del resultado y agrégalo a Vercel como <code className="rounded bg-row px-1 text-[length:var(--text-xs)]">GOOGLE_SHEETS_SPREADSHEET_ID</code></li>
        </ol>
      </SectionCard>

      <div className="flex min-w-0 flex-col gap-[19px]">
        <SectionCard title="Acciones" borderedHeader contentClassName="flex flex-col gap-[var(--space-md)] p-5">
          {ACCIONES.map(a => (
            <div
              key={a.id}
              className="flex flex-wrap items-center gap-[var(--space-md)] rounded-[var(--radius-sm)] border border-hairline bg-row px-[var(--row-pad-x)] py-[var(--space-md)]"
            >
              <div className="min-w-[160px] flex-1">
                <div className="text-[length:var(--text-base)] font-medium text-ink">{a.label}</div>
                <div className="mt-0.5 text-[length:var(--text-xs)] text-faint">{a.nota}</div>
              </div>
              <Button
                variant={a.variant}
                size="md"
                iconLeft={isLoading && activeAction === a.id ? 'loader' : a.icon}
                disabled={isLoading}
                onClick={() => run(a.id)}
              >
                {isLoading && activeAction === a.id ? 'Corriendo…' : 'Ejecutar'}
              </Button>
            </div>
          ))}
        </SectionCard>

        {step === 'error' && errorMsg && (
          <div className="flex items-start gap-[var(--space-md)] rounded-[var(--radius-sm)] bg-cancelled-bg p-[19px] text-cancelled-fg">
            <Icon name="warning" size={17} className="mt-0.5 flex-none" />
            <span className="flex-1 text-[length:var(--text-base)] leading-[var(--lh-body)]">{errorMsg}</span>
          </div>
        )}

        {step === 'done' && result && (
          <SectionCard
            title={result.state === 'error' ? 'Resultado — parcial, revisar' : 'Resultado'}
            borderedHeader
            contentClassName="p-0"
            actions={
              sheetUrl && (
                <Button href={sheetUrl} target="_blank" rel="noopener noreferrer" variant="ghost" size="md" iconRight="link">
                  Abrir el Sheet
                </Button>
              )
            }
          >
            {result.state === 'error' && (
              <div className="flex items-start gap-[var(--space-md)] border-b border-hairline bg-cancelled-bg p-[19px] text-cancelled-fg">
                <Icon name="warning" size={17} className="mt-0.5 flex-none" />
                <span className="flex-1 text-[length:var(--text-base)] leading-[var(--lh-body)]">
                  Alguna(s) tabla(s) fallaron al sincronizar -- revisa el detalle abajo.
                </span>
              </div>
            )}

            {hayTotales && (
              <div className="grid grid-cols-2 gap-[19px] border-b border-hairline p-[19px] sm:grid-cols-4">
                {[
                  ['Insertadas', totales.insertadas, 'text-approved-fg'],
                  ['Actualizadas', totales.actualizadas, 'text-ink'],
                  ['Borradas', totales.borradas, 'text-subtext'],
                  ['Errores', totales.errores, totales.errores ? 'text-cancelled-fg' : 'text-subtext'],
                ].map(([label, value, color]) => (
                  <div key={label as string}>
                    <div className="sn-label mb-1">{label}</div>
                    <div className={`sn-display text-h3 ${color}`}>{value}</div>
                  </div>
                ))}
              </div>
            )}

            {getSummaryLine() && !hayTotales && (
              <p className="p-[19px] pb-0 text-[length:var(--text-base)] text-body">{getSummaryLine()}</p>
            )}

            {result.spreadsheetId && (
              <div className="m-[19px] rounded-control bg-input p-3">
                <p className="mb-1 text-[length:var(--text-xs)] text-subtext">
                  SpreadsheetId (agregar a Vercel como <code>GOOGLE_SHEETS_SPREADSHEET_ID</code>):
                </p>
                <code className="break-all text-[length:var(--text-base)] text-accent">{result.spreadsheetId}</code>
              </div>
            )}

            {getResultsArray().length > 0 && (
              <div className="pb-2">
                {getResultsArray().map((r, i) => (
                  <div
                    key={r.tab + i}
                    className="flex flex-wrap items-center gap-[var(--space-md)] border-b border-hairline px-[var(--row-pad-x)] py-2.5 last:border-0"
                  >
                    {r.ok ? (
                      <Icon name="check" size={15} strokeWidth={2.5} className="text-approved-fg" />
                    ) : (
                      <Icon name="close" size={15} strokeWidth={2.5} className="text-cancelled-fg" />
                    )}
                    <span className="min-w-[120px] flex-1 text-[length:var(--text-base)] text-body">{r.tab}</span>
                    <span className="text-[length:var(--text-md)] text-subtext">
                      {r.ok
                        ? r.rows !== undefined
                          ? `${r.rows} filas`
                          : [`+${r.inserted ?? 0}`, `~${r.updated ?? 0}`, (r.deleted ?? 0) > 0 ? `-${r.deleted}` : null].filter(Boolean).join(' ')
                        : `${r.errors ?? 0} errores`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}
      </div>
    </div>
  )
}
