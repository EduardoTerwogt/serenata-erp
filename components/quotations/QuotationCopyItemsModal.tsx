'use client'

import { useEffect, useMemo, useState } from 'react'
import { Cotizacion, ItemCotizacion } from '@/lib/types'
import { fmtCurrency } from '@/lib/quotations/format'
import { fetchQuotationsList } from '@/lib/services/quotation-service'

interface Props {
  open: boolean
  onClose: () => void
  excludeCotizacionId?: string
  onImport: (items: ItemCotizacion[]) => void | Promise<void>
}

export function QuotationCopyItemsModal({ open, onClose, excludeCotizacionId, onImport }: Props) {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedCotizacionId, setSelectedCotizacionId] = useState<string | null>(null)
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (!open) return
    setSearch('')
    setSelectedCotizacionId(null)
    setSelectedItemIds(new Set())
    setError(null)
    setLoading(true)
    fetchQuotationsList()
      .then((data) => setCotizaciones(data.filter((c) => c.id !== excludeCotizacionId)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error cargando cotizaciones'))
      .finally(() => setLoading(false))
  }, [open, excludeCotizacionId])

  const filteredCotizaciones = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return cotizaciones
    return cotizaciones.filter((c) =>
      c.id.toLowerCase().includes(q) || c.cliente.toLowerCase().includes(q) || c.proyecto.toLowerCase().includes(q)
    )
  }, [cotizaciones, search])

  const selectedCotizacion = useMemo(
    () => cotizaciones.find((c) => c.id === selectedCotizacionId) || null,
    [cotizaciones, selectedCotizacionId]
  )
  const sourceItems = selectedCotizacion?.items || []

  const toggleItem = (itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedItemIds((prev) =>
      prev.size === sourceItems.length ? new Set() : new Set(sourceItems.map((i) => i.id))
    )
  }

  const handleImport = async () => {
    const items = sourceItems.filter((i) => selectedItemIds.has(i.id))
    if (items.length === 0) return
    setImporting(true)
    try {
      await onImport(items)
      onClose()
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-card border border-hairline rounded-panel w-full max-w-2xl max-h-[85vh] flex flex-col shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 md:p-6 border-b border-hairline flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-body">Copiar desde otra cotización</h2>
          <button type="button" onClick={onClose} className="text-faint hover:text-body transition-colors">✕</button>
        </div>

        <div className="p-4 md:p-6 overflow-y-auto flex-1">
          {error && <div className="rounded-control border border-cancelled-bg/60 bg-cancelled-bg/20 text-cancelled-fg px-4 py-3 mb-4 text-sm">{error}</div>}

          {!selectedCotizacion ? (
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por folio, cliente o proyecto..."
                autoFocus
                className="w-full bg-input border border-hairline rounded-control px-3 py-2 text-body text-sm focus:outline-none focus:border-accent mb-3"
              />
              {loading ? (
                <p className="text-faint text-sm py-6 text-center">Cargando cotizaciones...</p>
              ) : filteredCotizaciones.length === 0 ? (
                <p className="text-faint text-sm py-6 text-center">No se encontraron cotizaciones</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredCotizaciones.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCotizacionId(c.id)}
                      className="w-full text-left bg-row hover:bg-row-alt border border-hairline rounded-control px-4 py-3 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="sn-display text-body text-sm" style={{ letterSpacing: '0.06em' }}>{c.id}</span>
                        <span className="text-xs text-faint">{(c.items || []).length} partida(s)</span>
                      </div>
                      <p className="text-body text-sm mt-0.5">{c.proyecto}</p>
                      <p className="text-faint text-xs">{c.cliente}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setSelectedCotizacionId(null); setSelectedItemIds(new Set()) }}
                className="text-faint hover:text-subtext text-sm mb-3"
              >
                ← Elegir otra cotización
              </button>
              <div className="mb-3">
                <span className="sn-display text-body" style={{ letterSpacing: '0.06em' }}>{selectedCotizacion.id}</span>
                <span className="text-subtext text-sm"> — {selectedCotizacion.proyecto} · {selectedCotizacion.cliente}</span>
              </div>

              {sourceItems.length === 0 ? (
                <p className="text-faint text-sm py-6 text-center">Esta cotización no tiene partidas</p>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-sm text-body mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedItemIds.size === sourceItems.length && sourceItems.length > 0}
                      onChange={toggleAll}
                      className="w-4 h-4 accent-[--sn-orange]"
                    />
                    Seleccionar todo ({sourceItems.length})
                  </label>
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                    {sourceItems.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-3 bg-row border border-hairline rounded-control px-3 py-2 cursor-pointer hover:border-row-alt"
                      >
                        <input
                          type="checkbox"
                          checked={selectedItemIds.has(item.id)}
                          onChange={() => toggleItem(item.id)}
                          className="w-4 h-4 accent-[--sn-orange] flex-shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-body text-sm truncate">{item.descripcion || 'Sin descripción'}</p>
                          <p className="text-faint text-xs">{item.categoria || 'Sin categoría'} · {item.responsable_nombre || 'Sin responsable'}</p>
                        </div>
                        <span className="text-subtext text-sm whitespace-nowrap">${fmtCurrency(item.importe)}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="p-4 md:p-6 border-t border-hairline flex justify-end gap-3">
          <button type="button" onClick={onClose} className="text-subtext hover:text-body px-4 py-2 rounded-control transition-colors">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!selectedCotizacion || selectedItemIds.size === 0 || importing}
            className="bg-accent hover:bg-accent-pressed text-accent-ink px-4 py-2 rounded-control text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {importing ? 'Trayendo...' : `Traer a cotización actual${selectedItemIds.size > 0 ? ` (${selectedItemIds.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
