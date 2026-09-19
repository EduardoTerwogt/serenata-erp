'use client'
import dynamic from 'next/dynamic'
import { Suspense, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { formatDateDisplay } from '@/lib/format-date'
import { QuotationGeneralInfoSection } from '@/components/quotations/QuotationGeneralInfoSection'
import { QuotationCopyItemsModal } from '@/components/quotations/QuotationCopyItemsModal'
import { useLocalQuotationItems } from '@/hooks/useQuotationItems'
import { useNuevaCotizacionPage } from '@/app/cotizaciones/nueva/useNuevaCotizacionPage'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { SectionLoading } from '@/components/ui/SectionLoading'

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
  const { data: session } = useSession()
  const {
    register,
    watch,
    setValue,
    fields,
    getValues,
    replace,
    editingItemRowId,
    setEditingItemRowId,
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
    notasPdf,
    setNotasPdf,
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
    draftId,
    autosaveStatus,
    esComplementaria,
    complementaria_de,
  } = useNuevaCotizacionPage()

  const [showCopyModal, setShowCopyModal] = useState(false)
  const [showNotasModal, setShowNotasModal] = useState(false)

  // Mismo criterio que app/cotizaciones/[id]/page.tsx: el botón "Crear
  // plantilla" se muestra solo a quien ya tiene sección `planeacion`, sin
  // tocar el guard del backend (supuesto 4 de docs/PLAN.md).
  const userSections = useMemo(
    () => (session?.user as { sections?: string[] })?.sections ?? [],
    [session?.user]
  )
  const canCreateTemplate = userSections.includes('planeacion')

  // Mismo contrato que usa la pantalla de edición; aquí las partidas viven en memoria
  // porque la cotización todavía no existe en la base.
  const itemsController = useLocalQuotationItems({
    getValues,
    setValue,
    replace,
    seleccionarProducto,
    responsables,
  })

  return (
    <div className="flex flex-col gap-[19px]">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-3 min-w-0">
          <Button href="/cotizaciones" variant="ghost" size="md" iconLeft="arrow-left">
            Cotizaciones
          </Button>
          <h1 className="sn-display flex-none text-2xl text-ink md:text-h2">Nueva Cotizacion</h1>
          <span className="flex-none text-subtext">Folio: <span className="sn-display text-body" style={{ fontSize: 13, letterSpacing: '0.06em' }}>{folio || '...'}</span></span>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          <span className="text-content text-faint" aria-live="polite">
            {autosaveStatus === 'saving' && 'Guardando borrador…'}
            {autosaveStatus === 'saved' && 'Borrador guardado'}
            {autosaveStatus === 'error' && 'No se pudo guardar el borrador'}
          </span>
          <div className="flex flex-wrap gap-2">
            {draftId && (
              <Button href={`/api/cotizaciones/${draftId}/generar-pdf?mode=inline`} target="_blank" rel="noopener noreferrer" variant="secondary" size="lg">Vista previa</Button>
            )}
            {!esComplementaria && (
              <Button onClick={() => setShowNotasModal(true)} variant="secondary" size="lg" iconLeft="edit">Nota de evento{notasInternas && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}</Button>
            )}
            <Button disabled={guardando} onClick={onGenerarCotizacion} variant="primary" size="lg">
              {guardando ? 'Generando...' : 'Generar Cotizacion'}
            </Button>
          </div>
        </div>
      </div>

      {showNotasModal && (
        <Modal title="Nota de evento" subtitle="Uso interno, no sale en el PDF" onClose={() => setShowNotasModal(false)}>
          <div>
            <p className="sn-label mb-2">Nota de evento · uso interno, no sale en el PDF</p>
            <textarea value={notasInternas} onChange={e => setNotasInternas(e.target.value)} rows={4} placeholder="Sin notas..." className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-body text-content resize-none outline-none placeholder-faint focus:border-accent-quiet" />
            <p className="sn-label mb-2 mt-4">Notas del PDF · se imprimen debajo de Totales</p>
            <textarea value={notasPdf} onChange={e => setNotasPdf(e.target.value)} rows={4} placeholder="Sin notas para el PDF..." className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-body text-content resize-none outline-none placeholder-faint focus:border-accent-quiet" />
          </div>
        </Modal>
      )}

      {esComplementaria && (
        <div className="rounded-control border border-issued-fg/30 bg-issued-bg text-issued-fg px-4 py-3">
          Cotizacion complementaria de <span className="font-mono font-bold">{complementaria_de}</span>
        </div>
      )}

      {error && (
        <div className="rounded-control border border-cancelled-fg/30 bg-cancelled-bg text-cancelled-fg px-4 py-3">
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
        watchedItems={watchedItems}
        fields={fields}
        editingItemRowId={editingItemRowId}
        setEditingItemRowId={setEditingItemRowId}
        calcItem={calcItem}
        handleDescripcionChange={handleDescripcionChange}
        productoSugerencias={productoSugerencias}
        mostrarProductoDropdown={mostrarProductoDropdown}
        setMostrarProductoDropdown={setMostrarProductoDropdown}
        responsables={responsables}
        onCopyClick={() => setShowCopyModal(true)}
        canCreateTemplate={canCreateTemplate}
        items={itemsController}
      />

      <QuotationCopyItemsModal
        open={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        onImport={itemsController.importItems}
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
  return <Suspense fallback={<SectionLoading />}><NuevaCotizacionContent /></Suspense>
}
