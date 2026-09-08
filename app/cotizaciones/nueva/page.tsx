'use client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Suspense, useState } from 'react'
import { ItemCotizacion } from '@/lib/types'
import { isBlankQuotationItem } from '@/lib/quotations/mappers'
import { formatDateDisplay } from '@/lib/format-date'
import { QuotationGeneralInfoSection } from '@/components/quotations/QuotationGeneralInfoSection'
import { QuotationCopyItemsModal } from '@/components/quotations/QuotationCopyItemsModal'
import { useNuevaCotizacionPage } from '@/app/cotizaciones/nueva/useNuevaCotizacionPage'
import { Icon } from '@/components/ui/Icon'

const QuotationItemsSection = dynamic(
  () => import('@/components/quotations/QuotationItemsSection').then((mod) => mod.QuotationItemsSection),
  {
    ssr: false,
    loading: () => <div className="rounded-panel border border-hairline bg-card p-6 text-subtext">Cargando partidas...</div>,
  }
)

const QuotationTotalsPanels = dynamic(
  () => import('@/components/quotations/QuotationTotalsPanels').then((mod) => mod.QuotationTotalsPanels),
  {
    ssr: false,
    loading: () => <div className="rounded-panel border border-hairline bg-card p-6 text-subtext">Cargando totales...</div>,
  }
)

function NuevaCotizacionContent() {
  const {
    register,
    watch,
    setValue,
    fields,
    append,
    remove,
    editingItemIndex,
    setEditingItemIndex,
    folio,
    responsables,
    guardando,
    error,
    porcentaje_fee,
    setPorcentajeFee,
    iva_activo,
    setIvaActivo,
    descuento_tipo,
    setDescuentoTipo,
    descuento_valor,
    setDescuentoValor,
    notasInternas,
    setNotasInternas,
    calcItem,
    handleClienteChange,
    handleProyectoChange,
    handleDescripcionChange,
    seleccionarProducto,
    seleccionarCliente,
    listaClientes,
    clienteInput,
    clienteSugerencias,
    mostrarClienteDropdown,
    setMostrarClienteDropdown,
    proyectosDelCliente,
    proyectoInput,
    setProyectoInput,
    mostrarProyectoDropdown,
    setMostrarProyectoDropdown,
    productoSugerencias,
    mostrarProductoDropdown,
    setMostrarProductoDropdown,
    watchedItems,
    totales,
    estimatedTaxes,
    onGenerarCotizacion,
    autosaveStatus,
    esComplementaria,
    complementaria_de,
  } = useNuevaCotizacionPage()

  const [showCopyModal, setShowCopyModal] = useState(false)

  const handleImportItems = (items: ItemCotizacion[]) => {
    // Si la única fila es la vacía de arranque, se reusa para el primer ítem
    // importado en vez de dejarla colgando arriba.
    let startIndex = 0
    if (watchedItems.length === 1 && isBlankQuotationItem(watchedItems[0]) && items[0]) {
      const first = items[0]
      setValue('items.0.categoria', first.categoria || '')
      setValue('items.0.descripcion', first.descripcion || '')
      setValue('items.0.cantidad', first.cantidad || 1)
      setValue('items.0.precio_unitario', first.precio_unitario || 0)
      setValue('items.0.responsable_id', first.responsable_id || '')
      setValue('items.0.responsable_nombre', first.responsable_nombre || '')
      setValue('items.0.x_pagar', first.x_pagar || 0)
      startIndex = 1
    }

    items.slice(startIndex).forEach((item) => {
      append({
        categoria: item.categoria || '',
        descripcion: item.descripcion || '',
        cantidad: item.cantidad || 1,
        precio_unitario: item.precio_unitario || 0,
        responsable_id: item.responsable_id || '',
        responsable_nombre: item.responsable_nombre || '',
        x_pagar: item.x_pagar || 0,
      })
    })
  }

  return (
    <div className="flex flex-col gap-[19px]">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-3 min-w-0">
          <Link href="/cotizaciones" className="flex flex-none items-center gap-1.5 text-content text-faint hover:text-subtext">
            <Icon name="arrow-left" size={14} />
            Cotizaciones
          </Link>
          <h1 className="sn-display flex-none text-2xl text-ink md:text-h2">Nueva Cotizacion</h1>
          <span className="flex-none text-subtext">Folio: <span className="sn-display text-body" style={{ fontSize: 13, letterSpacing: '0.06em' }}>{folio || '...'}</span></span>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          <span className="text-content text-faint" aria-live="polite">
            {autosaveStatus === 'saving' && 'Guardando borrador…'}
            {autosaveStatus === 'saved' && 'Borrador guardado'}
            {autosaveStatus === 'error' && 'No se pudo guardar el borrador'}
          </span>
          <button
            type="button"
            disabled={guardando}
            onClick={onGenerarCotizacion}
            className="bg-accent hover:bg-accent-pressed text-accent-ink px-4 py-3 rounded-control text-content font-semibold transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {guardando ? 'Generando...' : 'Generar Cotizacion'}
          </button>
        </div>
      </div>

      {esComplementaria && (
        <div className="rounded-control border border-issued-bg/60 bg-issued-bg/20 text-issued-fg px-4 py-3">
          Cotizacion complementaria de <span className="font-mono font-bold">{complementaria_de}</span>
        </div>
      )}

      {error && (
        <div className="rounded-control border border-cancelled-bg/60 bg-cancelled-bg/20 text-cancelled-fg px-4 py-3">
          {error}
        </div>
      )}

      <QuotationGeneralInfoSection
        register={register}
        setValue={setValue}
        clienteInput={clienteInput}
        proyectoInput={proyectoInput}
        clienteSugerencias={clienteSugerencias}
        mostrarClienteDropdown={mostrarClienteDropdown}
        setMostrarClienteDropdown={setMostrarClienteDropdown}
        proyectosDelCliente={proyectosDelCliente}
        mostrarProyectoDropdown={mostrarProyectoDropdown}
        setMostrarProyectoDropdown={setMostrarProyectoDropdown}
        listaClientes={listaClientes}
        handleClienteChange={handleClienteChange}
        handleProyectoChange={handleProyectoChange}
        seleccionarCliente={seleccionarCliente}
        setProyectoInput={setProyectoInput}
        isReadOnly={esComplementaria}
        readOnlyDisplay="input"
        dateLabel={formatDateDisplay(new Date())}
        fechaEntregaValue={watch('fecha_entrega')}
        locacionValue={watch('locacion')}
        notasField={esComplementaria ? undefined : { value: notasInternas, onChange: setNotasInternas }}
      />

      <QuotationItemsSection
        editable
        register={register}
        setValue={setValue}
        watchedItems={watchedItems}
        fields={fields}
        append={append}
        remove={remove}
        editingItemIndex={editingItemIndex}
        setEditingItemIndex={setEditingItemIndex}
        calcItem={calcItem}
        handleDescripcionChange={handleDescripcionChange}
        seleccionarProducto={seleccionarProducto}
        productoSugerencias={productoSugerencias}
        mostrarProductoDropdown={mostrarProductoDropdown}
        setMostrarProductoDropdown={setMostrarProductoDropdown}
        responsables={responsables}
        onCopyClick={() => setShowCopyModal(true)}
      />

      <QuotationCopyItemsModal
        open={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        onImport={handleImportItems}
      />

      <QuotationTotalsPanels
        totals={totales}
        editable
        porcentaje_fee={porcentaje_fee}
        setPorcentajeFee={setPorcentajeFee}
        iva_activo={iva_activo}
        setIvaActivo={setIvaActivo}
        descuento_tipo={descuento_tipo}
        setDescuentoTipo={setDescuentoTipo}
        descuento_valor={descuento_valor}
        setDescuentoValor={setDescuentoValor}
        estimatedTaxes={estimatedTaxes}
      />
    </div>
  )
}

export default function NuevaCotizacionPage() {
  return <Suspense fallback={<div className="p-8 text-body">Cargando...</div>}><NuevaCotizacionContent /></Suspense>
}
