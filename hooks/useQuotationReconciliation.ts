import { Dispatch, MutableRefObject, SetStateAction, useCallback, useRef } from 'react'
import { UseFieldArrayAppend, UseFieldArrayReplace, UseFormGetValues, UseFormSetValue } from 'react-hook-form'
import { Cotizacion, ItemCotizacion } from '@/lib/types'
import { QuotationFormValues } from '@/lib/quotations/types'
import { reconcileServerItems } from '@/lib/quotations/mappers'
import { getItemCellKey, mapItemToFormItem } from '@/lib/quotations/collaboration'
import { QuotationItemCellField } from '@/hooks/useQuotationPresence'
import { fetchQuotationDetail } from '@/lib/services/quotation-service'

interface UseQuotationReconciliationOptions {
  id: string
  getValues: UseFormGetValues<QuotationFormValues>
  setValue: UseFormSetValue<QuotationFormValues>
  append: UseFieldArrayAppend<QuotationFormValues, 'items'>
  replace: UseFieldArrayReplace<QuotationFormValues, 'items'>
  setCotizacion: Dispatch<SetStateAction<Cotizacion | null>>
  recordServerItem: (item: ItemCotizacion) => void
  hasLocalItemRowActivity: (rowId: string) => boolean
  // EF-3 3D-5 (extracción del clúster de partidas) todavía no corrió -- estos
  // refs siguen siendo propiedad de `page.tsx` y se reciben tal cual, en vez
  // de venir de un hook `useQuotationItemCellsAutosave`. El día que 3D-5
  // exista, esta firma cambia para recibirlos desde ahí; el comportamiento
  // de reconciliación no cambia.
  itemDirtyCellsRef: MutableRefObject<Set<string>>
  itemFocusedCellsRef: MutableRefObject<Set<string>>
  itemSavingCellsRef: MutableRefObject<Set<string>>
  localWriteAtRef: MutableRefObject<Map<string, number>>
  pendingRowCreationsRef: MutableRefObject<Map<string, Promise<void>>>
  pendingRowRemovalsRef: MutableRefObject<Set<string>>
  applyCotizacionToState: (cot: Cotizacion) => void
  notasLockHeldRef: MutableRefObject<boolean>
  notasDirtyRef: MutableRefObject<boolean>
  applyNotasOnly: (notas: string | null, notasPdf: string | null) => void
  generalLockHeldRef: MutableRefObject<boolean>
  generalDirtyRef: MutableRefObject<boolean>
  applyGeneralOnly: (cot: Cotizacion, pedidoEn: number) => void
  totalsLockHeldRef: MutableRefObject<boolean>
  totalsDirtyRef: MutableRefObject<boolean>
  applyTotalsOnly: (cot: Cotizacion, pedidoEn: number) => void
}

/**
 * EF-3 3D-6: `reconciliarConServidor`/`resyncPartidas`/`reconciliacionEnCursoRef`
 * extraídos verbatim de `app/cotizaciones/[id]/page.tsx` -- cierra F17. Sin
 * cambios de comportamiento: el characterization test de interleaving de
 * 3D-0 (T11/T12, con el fix de 3D-0b) ya documentó el comportamiento real
 * que esta extracción reproduce.
 */
export function useQuotationReconciliation({
  id,
  getValues,
  setValue,
  append,
  replace,
  setCotizacion,
  recordServerItem,
  hasLocalItemRowActivity,
  itemDirtyCellsRef,
  itemFocusedCellsRef,
  itemSavingCellsRef,
  localWriteAtRef,
  pendingRowCreationsRef,
  pendingRowRemovalsRef,
  applyCotizacionToState,
  notasLockHeldRef,
  notasDirtyRef,
  applyNotasOnly,
  generalLockHeldRef,
  generalDirtyRef,
  applyGeneralOnly,
  totalsLockHeldRef,
  totalsDirtyRef,
  applyTotalsOnly,
}: UseQuotationReconciliationOptions) {
  // Red de seguridad única: ante cualquier fallo del servidor se vuelve a leer la
  // cotización y se reconstruye la tabla, en vez de parchear el estado local a mano
  // (que era lo que dejaba filas fantasma imposibles de borrar).
  const resyncPartidas = useCallback(async () => {
    try {
      const updated = await fetchQuotationDetail(id)
      pendingRowRemovalsRef.current.clear()
      pendingRowCreationsRef.current.clear()
      applyCotizacionToState(updated)
    } catch (loadError) {
      console.error('[cotizaciones/[id]] Error resincronizando partidas:', loadError)
    }
  }, [applyCotizacionToState, id, pendingRowCreationsRef, pendingRowRemovalsRef])

  /**
   * Reconciliación con el servidor: la ÚNICA garantía de que las dos pantallas
   * terminen viendo lo mismo. PostgreSQL es la única fuente de verdad -- esto lee de
   * la base a través de nuestro propio servidor (el que sí valida la sesión), nunca
   * de un dato que otro navegador haya empujado directamente.
   *
   * La dispara cada evento server-confirmed (`item_confirmed`/`general_confirmed`/
   * `totales_confirmed`/`notas_confirmed`, emitidos DESPUÉS de que Postgres commitea
   * -- ver `lib/server/realtime/broadcast.ts`), reconectar el canal, volver a la
   * pestaña, y un latido periódico como red de seguridad si algo de lo anterior se
   * pierde.
   *
   * Nada de esto pisa lo que el usuario está escribiendo: las celdas sucias, bajo el
   * cursor o con guardado en vuelo se conservan, y una respuesta que salió antes de
   * una escritura local pierde contra ella.
   *
   * Fase 6.7 pedía simplificar esta función una vez que IDs temporales y datos
   * empujados por otro navegador dejaran de existir -- eso ya pasó en Fase 6B (IDs
   * estables, sin `migrateRowKeys`) y 6D (`item_mutation` retirado), y esa era la
   * complejidad real que arrastraba. Lo que queda -- `celdaOcupada` (dirty/foco/
   * guardando), `escrituraLocalPosterior` (`localWriteAtRef`) y `conservarLocal`
   * (`pendingRowCreationsRef`) -- no es legacy: sigue siendo necesario para no
   * pisar una edición en curso o una fila cuya alta todavía no confirmó el
   * servidor. RHF/FieldArray tampoco decide verdad colaborativa aquí: solo pinta
   * lo que esta función ya reconcilió contra el servidor.
   */
  const reconciliacionEnCursoRef = useRef<Promise<void> | null>(null)
  const reconciliarConServidor = useCallback(async () => {
    // Varias pistas seguidas, o pista y latido a la vez, no deben abrir lecturas
    // paralelas que luego compitan entre sí al aplicarse.
    if (reconciliacionEnCursoRef.current) return reconciliacionEnCursoRef.current

    const trabajo = (async () => {
      const pedidoEn = Date.now()
      try {
      const updated = await fetchQuotationDetail(id)
      for (const item of updated.items || []) recordServerItem(item)
      const locales = getValues('items') || []
      const servidor = (updated.items || []).map(mapItemToFormItem)
      const fusionadas = reconcileServerItems(locales, servidor, {
        celdaOcupada: (rowId, campo) => {
          const key = getItemCellKey(rowId, campo as QuotationItemCellField)
          return itemDirtyCellsRef.current.has(key) || itemFocusedCellsRef.current.has(key) || itemSavingCellsRef.current.has(key)
        },
        // Una escritura local posterior a la petición gana: el servidor respondió
        // con una foto anterior y aplicarla borraría lo recién capturado.
        escrituraLocalPosterior: (rowId, campo) => {
          const at = localWriteAtRef.current.get(getItemCellKey(rowId, campo as QuotationItemCellField))
          return at !== undefined && at >= pedidoEn
        },
        // Las filas cuya alta sigue en vuelo y las que se están borrando siguen
        // siendo del usuario.
        conservarLocal: (rowId) => pendingRowCreationsRef.current.has(rowId) || hasLocalItemRowActivity(rowId),
      })

      const mismasFilas = fusionadas.length === locales.length && fusionadas.every((item, i) => item.id === locales[i]?.id)
      if (mismasFilas) {
        // Mismo conjunto de filas: se actualiza celda a celda para NO remontar los
        // inputs y no robarle el foco a quien está escribiendo.
        fusionadas.forEach((item, index) => {
          const local = locales[index]
          if (item.categoria !== local.categoria) setValue(`items.${index}.categoria`, item.categoria)
          if (item.descripcion !== local.descripcion) setValue(`items.${index}.descripcion`, item.descripcion)
          if (item.cantidad !== local.cantidad) setValue(`items.${index}.cantidad`, item.cantidad)
          if (item.precio_unitario !== local.precio_unitario) setValue(`items.${index}.precio_unitario`, item.precio_unitario)
          if (item.x_pagar !== local.x_pagar) setValue(`items.${index}.x_pagar`, item.x_pagar)
          if (item.responsable_id !== local.responsable_id) {
            setValue(`items.${index}.responsable_id`, item.responsable_id)
            setValue(`items.${index}.responsable_nombre`, item.responsable_nombre)
          }
        })
      } else {
        // Cambió el conjunto de filas. `replace` remonta la tabla entera y le quita el
        // cursor a quien está escribiendo -- la molestia que este mismo módulo ya había
        // arreglado-, así que solo se usa como último recurso y conservando el foco.
        const idsLocales = locales.map((item) => item.id)
        const idsFusionadas = fusionadas.map((item) => item.id)
        const soloSeAgregaronAlFinal =
          fusionadas.length > locales.length &&
          idsLocales.every((idLocal, i) => idLocal === idsFusionadas[i])

        if (soloSeAgregaronAlFinal) {
          // Filas nuevas al final: se añaden sin tocar las demás, así que nadie pierde
          // el cursor ni lo que está escribiendo.
          append(fusionadas.slice(locales.length), { shouldFocus: false })
        } else {
          // Cualquier otro cambio del conjunto (filas que desaparecieron, reordenes) se
          // aplica reconstruyendo la lista y devolviendo el foco donde estaba.
          //
          // Se intentó quitarlas una a una con `remove` para no remontar la tabla, y
          // medido con el canal simulado NO funciona: la fila no se va, queda una fila
          // fantasma sin id -la misma clase de fallo que este módulo ya tuvo- y cada
          // reconciliación vuelve a intentarlo. `replace` sí la quita.
          const enfocado = typeof document !== 'undefined' ? (document.activeElement as HTMLInputElement | null) : null
          const nombreEnfocado = enfocado?.getAttribute('name') || null
          let seleccion: [number, number] | null = null
          try {
            if (nombreEnfocado && enfocado?.selectionStart !== null && enfocado?.selectionEnd !== null) {
              seleccion = [enfocado!.selectionStart as number, enfocado!.selectionEnd as number]
            }
          } catch {
            // Los input[type=number] no exponen selección en todos los navegadores.
          }

          replace(fusionadas)

          if (nombreEnfocado) {
            // React remonta los inputs en su propio ciclo, y no basta con enfocar una
            // vez: medido, el primer intento acierta sobre el input VIEJO -todavía
            // conectado- y el foco se pierde en cuanto React lo reemplaza. Se insiste
            // unos frames hasta que el foco quede en el input que de verdad quedó.
            let frames = 0
            const devolverFoco = () => {
              const destino = document.querySelector<HTMLInputElement>(`[name="${nombreEnfocado}"]`)
              if (destino?.isConnected && document.activeElement !== destino) {
                destino.focus()
                if (seleccion) {
                  try { destino.setSelectionRange(seleccion[0], seleccion[1]) } catch { /* ver arriba */ }
                }
              }
              if (frames++ < 12) window.requestAnimationFrame(devolverFoco)
            }
            window.requestAnimationFrame(devolverFoco)
          }
        }
      }
      setCotizacion((prev) => prev ? { ...prev, items: updated.items || [], subtotal: updated.subtotal, fee_agencia: updated.fee_agencia, general: updated.general, iva: updated.iva, total: updated.total, margen_total: updated.margen_total, utilidad_total: updated.utilidad_total } : prev)
        // Las tres secciones restantes solo se aplican si el usuario NO las tiene
        // ocupadas: applyGeneralOnly y compañía pisan el valor y además limpian la
        // marca de "sin guardar", así que aplicarlas a ciegas borraba la edición en
        // curso -- el mismo defecto que se arregló en las partidas, otra sección.
        if (!notasLockHeldRef.current && !notasDirtyRef.current) applyNotasOnly(updated.notas_internas ?? null, updated.notas_pdf ?? null)
        if (!generalLockHeldRef.current && !generalDirtyRef.current) applyGeneralOnly(updated, pedidoEn)
        if (!totalsLockHeldRef.current && !totalsDirtyRef.current) applyTotalsOnly(updated, pedidoEn)
      } catch (loadError) {
        console.error('[cotizaciones/[id]] Error reconciliando con el servidor:', loadError)
      }
    })()

    reconciliacionEnCursoRef.current = trabajo
    try {
      await trabajo
    } finally {
      reconciliacionEnCursoRef.current = null
    }
  }, [append, applyGeneralOnly, applyNotasOnly, applyTotalsOnly, generalDirtyRef, generalLockHeldRef, getValues, hasLocalItemRowActivity, id, itemDirtyCellsRef, itemFocusedCellsRef, itemSavingCellsRef, localWriteAtRef, notasDirtyRef, notasLockHeldRef, pendingRowCreationsRef, recordServerItem, replace, setCotizacion, setValue, totalsDirtyRef, totalsLockHeldRef])

  return {
    resyncPartidas,
    reconciliarConServidor,
  }
}
