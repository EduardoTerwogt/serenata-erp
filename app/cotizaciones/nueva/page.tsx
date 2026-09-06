'use client'
import dynamic from 'next/dynamic'
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
    loading: () => <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-gray-400">Cargando partidas...</div>,
  }
)

const QuotationTotalsPanels = dynamic(
  () => import('@/components/quotations/QuotationTotalsPanels').then((mod) => mod.QuotationTotalsPanels),
  {
    ssr: false,
    loading: () => <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-gray-400">Cargando totales...</div>,
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
    <div className="px-5 pt-6 pb-6 md:p-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Nueva Cotizacion</h1>
        <p className="text-gray-400 mt-1">Folio: <span className="font-mono text-blue-400 font-bold">{folio || '...'}</span></p>
      </div>

      {esComplementaria && (
        <div className="bg-blue-900/40 border border-blue-700 text-blue-300 rounded-lg px-4 py-3 mb-6">
          Cotizacion complementaria de <span className="font-mono font-bold">{complementaria_de}</span>
        </div>
      )}

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 mb-6">
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
          className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 min-h-[44px]"
        >
          {guardando ? 'Guardando...' : 'Guardar Borrador'}
        </button>
        <button
          type="button"
          disabled={guardando}
          onClick={onGenerarCotizacion}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 min-h-[44px]"
        >
          {guardando ? 'Generando...' : 'Generar Cotizacion'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-gray-400 hover:text-white px-4 py-3 rounded-lg transition-colors min-h-[44px]"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

export default function NuevaCotizacionPage() {
  return <Suspense fallback={<div className="p-8 text-white">Cargando...</div>}><NuevaCotizacionContent /></Suspense>
}
