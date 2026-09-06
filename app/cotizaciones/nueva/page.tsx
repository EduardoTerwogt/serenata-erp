'use client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Suspense, useState } from 'react'
import { ItemCotizacion } from '@/lib/types'
import { formatDateDisplay } from '@/lib/format-date'
import { QuotationGeneralInfoSection } from '@/components/quotations/QuotationGeneralInfoSection'
import { QuotationCopyItemsModal } from '@/components/quotations/QuotationCopyItemsModal'
import { useNuevaCotizacionPage } from '@/app/cotizaciones/nueva/useNuevaCotizacionPage'

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
    onGuardarBorrador,
    onGenerarCotizacion,
    esComplementaria,
    complementaria_de,
    router,
  } = useNuevaCotizacionPage()

  const [showCopyModal, setShowCopyModal] = useState(false)

  const handleImportItems = (items: ItemCotizacion[]) => {
    items.forEach((item) => {
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
      <div>
        <Link href="/cotizaciones" className="text-sm text-faint hover:text-subtext">← Cotizaciones</Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <h1 className="sn-display text-2xl text-ink md:text-h2">Nueva Cotizacion</h1>
          <span className="text-subtext">Folio: <span className="font-mono text-accent font-bold">{folio || '...'}</span></span>
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

      <div className="flex flex-col md:flex-row gap-3">
        <button
          type="button"
          disabled={guardando}
          onClick={onGuardarBorrador}
          className="bg-row hover:bg-row-alt text-body px-6 py-3 rounded-control font-medium transition-colors disabled:opacity-50 min-h-[44px]"
        >
          {guardando ? 'Guardando...' : 'Guardar Borrador'}
        </button>
        <button
          type="button"
          disabled={guardando}
          onClick={onGenerarCotizacion}
          className="bg-accent hover:bg-accent-pressed text-accent-ink px-6 py-3 rounded-control font-semibold transition-colors disabled:opacity-50 min-h-[44px]"
        >
          {guardando ? 'Generando...' : 'Generar Cotizacion'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-subtext hover:text-body px-4 py-3 rounded-control transition-colors min-h-[44px]"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

export default function NuevaCotizacionPage() {
  return <Suspense fallback={<div className="p-8 text-body">Cargando...</div>}><NuevaCotizacionContent /></Suspense>
}
