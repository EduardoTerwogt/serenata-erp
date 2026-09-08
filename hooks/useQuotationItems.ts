'use client'

import { useCallback, useMemo, useState } from 'react'
import { UseFieldArrayReplace, UseFormGetValues, UseFormSetValue } from 'react-hook-form'
import { Producto } from '@/lib/types'
import { QuotationFormItem, QuotationFormValues } from '@/lib/quotations/types'
import { EMPTY_QUOTATION_ITEM, isBlankQuotationItem } from '@/lib/quotations/mappers'
import { QuotationItemCellField } from '@/hooks/useQuotationPresence'

/**
 * Toda fila tiene identificador, siempre.
 *
 * `local:` — cotización que aún no existe en la base: la fila solo vive en memoria.
 * `temp:`  — fila ya enviada al servidor cuyo id definitivo todavía no ha llegado.
 *
 * Que no haya filas sin id es lo que permite que la tabla se comporte igual en las dos
 * pantallas: antes, en una cotización nueva las filas no tenían id y el componente
 * necesitaba una rama distinta para cada operación.
 */
export const LOCAL_ROW_PREFIX = 'local:'
export const TEMP_ROW_PREFIX = 'temp:'

export const newLocalRowId = () => `${LOCAL_ROW_PREFIX}${crypto.randomUUID()}`
export const isPersistedRowId = (rowId: string) =>
  !rowId.startsWith(LOCAL_ROW_PREFIX) && !rowId.startsWith(TEMP_ROW_PREFIX)

/** Forma mínima que comparten ItemCotizacion y ServiceTemplateItem. */
export interface ImportableItem {
  categoria?: string | null
  descripcion?: string | null
  cantidad?: number | null
  precio_unitario?: number | null
  x_pagar?: number | null
  responsable_id?: string | null
  responsable_nombre?: string | null
}

/**
 * Contrato único de la tabla de partidas. `QuotationItemsSection` habla solo con esto,
 * sin saber si la cotización ya existe en la base o no.
 */
export interface QuotationItemsController {
  addRow: () => void
  removeRow: (rowId: string) => void
  importItems: (items: ImportableItem[]) => void | Promise<void>
  selectProduct: (rowId: string, producto: Producto) => void
  changeResponsable: (rowId: string, responsableId: string) => void
  cellFocus: (rowId: string, field: QuotationItemCellField) => void
  cellBlur: (rowId: string, field: QuotationItemCellField) => void
  cellChange: (rowId: string, field: QuotationItemCellField) => void
  /** Otro colaborador está en esta fila: se resalta, nunca se bloquea. */
  isRowBusy: (rowId: string) => boolean
  isCellBusy: (rowId: string, field: QuotationItemCellField) => boolean
  rowStatusText: (rowId: string) => string | null
  importing: boolean
}

export function toFormItem(source: ImportableItem, id: string): QuotationFormItem {
  return {
    id,
    categoria: source.categoria || '',
    descripcion: source.descripcion || '',
    cantidad: source.cantidad || 1,
    precio_unitario: source.precio_unitario || 0,
    responsable_id: source.responsable_id || '',
    responsable_nombre: source.responsable_nombre || '',
    x_pagar: source.x_pagar || 0,
  }
}

/**
 * Coloca los ítems importados sobre las filas en blanco existentes (en orden,
 * conservando su id) y añade el resto al final. Las filas en blanco que sobren
 * desaparecen, así importar nunca deja filas vacías colgando.
 */
export function mergeImportedIntoBlanks(
  actuales: QuotationFormItem[],
  importados: ImportableItem[],
  nuevoId: () => string = newLocalRowId
): QuotationFormItem[] {
  const resultado: QuotationFormItem[] = []
  const pendientes = [...importados]

  for (const actual of actuales) {
    if (isBlankQuotationItem(actual)) {
      const siguiente = pendientes.shift()
      if (siguiente) resultado.push(toFormItem(siguiente, actual.id ?? nuevoId()))
      continue
    }
    resultado.push(actual)
  }

  return [...resultado, ...pendientes.map((source) => toFormItem(source, nuevoId()))]
}

interface LocalControllerOptions {
  getValues: UseFormGetValues<QuotationFormValues>
  setValue: UseFormSetValue<QuotationFormValues>
  replace: UseFieldArrayReplace<QuotationFormValues, 'items'>
  seleccionarProducto: (index: number, producto: Producto) => void
  responsables: { id: string; nombre: string }[]
}

/**
 * Partidas de una cotización que todavía no existe en la base: viven en memoria.
 * Ninguna operación viaja al servidor, pero la interfaz es idéntica a la del
 * controlador que sí persiste.
 */
export function useLocalQuotationItems({
  getValues,
  setValue,
  replace,
  seleccionarProducto,
  responsables,
}: LocalControllerOptions): QuotationItemsController {
  const items = useCallback(() => getValues('items') || [], [getValues])
  const indexOf = useCallback((rowId: string) => items().findIndex((item) => item.id === rowId), [items])

  const addRow = useCallback(() => {
    replace([...items(), { ...EMPTY_QUOTATION_ITEM, id: newLocalRowId() }])
  }, [items, replace])

  // Se reconstruye la lista completa en vez de quitar por índice: `remove(index)`
  // trabaja sobre la foto del último render y deja filas fantasma.
  const removeRow = useCallback((rowId: string) => {
    replace(items().filter((item) => item.id !== rowId))
  }, [items, replace])

  const importItems = useCallback((importados: ImportableItem[]) => {
    replace(mergeImportedIntoBlanks(items(), importados))
  }, [items, replace])

  const selectProduct = useCallback((rowId: string, producto: Producto) => {
    const index = indexOf(rowId)
    if (index >= 0) seleccionarProducto(index, producto)
  }, [indexOf, seleccionarProducto])

  const changeResponsable = useCallback((rowId: string, responsableId: string) => {
    const index = indexOf(rowId)
    if (index < 0) return
    setValue(`items.${index}.responsable_id`, responsableId)
    setValue(`items.${index}.responsable_nombre`, responsables.find((r) => r.id === responsableId)?.nombre ?? '')
  }, [indexOf, responsables, setValue])

  const noop = useCallback(() => {}, [])

  return useMemo(() => ({
    addRow,
    removeRow,
    importItems,
    selectProduct,
    changeResponsable,
    // Sin cotización en la base no hay autoguardado por celda ni colaboración.
    cellFocus: noop,
    cellBlur: noop,
    cellChange: noop,
    isRowBusy: () => false,
    isCellBusy: () => false,
    rowStatusText: () => null,
    importing: false,
  }), [addRow, changeResponsable, importItems, noop, removeRow, selectProduct])
}

/** Estado de "importando" compartido por el controlador del servidor. */
export function useImportingFlag() {
  return useState(false)
}
