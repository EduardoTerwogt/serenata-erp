'use client'

import { useState } from 'react'
import { PagoComprobante } from '@/lib/types'
import { formatDateDisplay } from '@/lib/format-date'
import { DateField } from '@/components/ui/DateField'

const MAX_COMPROBANTE_BYTES = 3.5 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 1600
const JPEG_QUALITIES = [0.82, 0.72, 0.62, 0.52, 0.42]

function fmt(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

function isImageFile(file: File) {
  return file.type.startsWith('image/')
}

function buildCompressedFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'comprobante'
  return `${baseName}.jpg`
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('No se pudo procesar la imagen del comprobante'))
      img.src = objectUrl
    })

    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

async function canvasToJpegFile(canvas: HTMLCanvasElement, fileName: string, quality: number) {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), 'image/jpeg', quality)
  })

  if (!blob) {
    throw new Error('No se pudo comprimir el comprobante')
  }

  return new File([blob], buildCompressedFileName(fileName), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}

async function compressImageFile(file: File): Promise<File> {
  const image = await loadImageElement(file)
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('No se pudo preparar el comprobante para subirlo')
  }

  context.drawImage(image, 0, 0, width, height)

  let smallestCandidate: File | null = null

  for (const quality of JPEG_QUALITIES) {
    const compressed = await canvasToJpegFile(canvas, file.name, quality)

    if (!smallestCandidate || compressed.size < smallestCandidate.size) {
      smallestCandidate = compressed
    }

    if (compressed.size <= MAX_COMPROBANTE_BYTES) {
      return compressed
    }
  }

  return smallestCandidate || file
}

async function normalizeComprobante(file: File): Promise<File> {
  if (file.size <= MAX_COMPROBANTE_BYTES) {
    return file
  }

  if (!isImageFile(file)) {
    throw new Error('El comprobante es demasiado pesado. Usa un archivo menor a 4 MB.')
  }

  const compressed = await compressImageFile(file)

  if (compressed.size > MAX_COMPROBANTE_BYTES) {
    throw new Error('No se pudo reducir lo suficiente el comprobante. Usa una imagen más ligera o menor a 4 MB.')
  }

  return compressed
}

interface TabRegistrarPagoCobrarProps {
  tipo: 'cobrar'
  cuentaId: string
  estado: string
  pagos: PagoComprobante[]
  onRegistrarPago: (id: string, data: { monto: number; tipo_pago: string; fecha_pago: string; notas?: string; comprobante?: File }) => Promise<unknown>
  onRefresh: () => void
}

interface TabRegistrarPagoPagarProps {
  tipo: 'pagar'
  cuentaId: string
  estado: string
  onRegistrarPago: (id: string, data: { monto: number; comprobante?: File }) => Promise<unknown>
  onRefresh: () => void
}

type TabRegistrarPagoProps = TabRegistrarPagoCobrarProps | TabRegistrarPagoPagarProps

export function TabRegistrarPago(props: TabRegistrarPagoProps) {
  const [monto, setMonto] = useState('')
  const [tipoPago, setTipoPago] = useState('TRANSFERENCIA')
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().split('T')[0])
  const [notas, setNotas] = useState('')
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const showOrdenInfo = props.tipo === 'pagar' && props.estado === 'EN_PROCESO_PAGO'
  const isPagado = props.estado === 'PAGADO'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const montoNum = parseFloat(monto)
    if (!montoNum || montoNum <= 0) { setError('Ingresa un monto válido'); return }

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const normalizedComprobante = comprobante ? await normalizeComprobante(comprobante) : undefined

      if (props.tipo === 'cobrar') {
        await props.onRegistrarPago(props.cuentaId, {
          monto: montoNum,
          tipo_pago: tipoPago,
          fecha_pago: fechaPago,
          notas: notas || undefined,
          comprobante: normalizedComprobante,
        })
      } else {
        await props.onRegistrarPago(props.cuentaId, {
          monto: montoNum,
          comprobante: normalizedComprobante,
        })
      }
      setSuccess(true)
      setMonto('')
      setNotas('')
      setComprobante(null)
      props.onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar pago')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-h3 font-semibold text-ink mb-4">Registrar Pago</h3>

      {showOrdenInfo && (
        <div className="p-3 rounded-control border border-issued-bg/60 bg-issued-bg/20">
          <p className="text-issued-fg text-content">
            Esta cuenta está vinculada a una Orden de Pago. Puedes registrar el pago normalmente para completar la orden.
          </p>
        </div>
      )}

      {isPagado && (
        <div className="p-3 rounded-control border border-approved-bg/60 bg-approved-bg/20">
          <p className="text-approved-fg text-content">
            Esta cuenta ya está totalmente pagada.
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-control border border-cancelled-bg/60 bg-cancelled-bg/20">
          <p className="text-cancelled-fg text-content">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-control border border-approved-bg/60 bg-approved-bg/20">
          <p className="text-approved-fg text-content">Pago registrado correctamente</p>
        </div>
      )}

      {!isPagado && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-content font-medium text-body mb-2">Monto</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body placeholder-faint focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-content font-medium text-body mb-2">
                {props.tipo === 'cobrar' ? 'Tipo de Pago' : 'Comprobante'}
              </label>
              {props.tipo === 'cobrar' ? (
                <select
                  value={tipoPago}
                  onChange={(e) => setTipoPago(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body focus:outline-none focus:border-accent"
                >
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="EFECTIVO">Efectivo</option>
                </select>
              ) : (
                <input
                  type="file"
                  onChange={(e) => setComprobante(e.target.files?.[0] || null)}
                  className="w-full text-content text-subtext file:mr-3 file:py-1.5 file:px-3 file:rounded-control file:border-0 file:text-content file:bg-row file:text-subtext hover:file:bg-row-alt"
                />
              )}
            </div>
          </div>

          {props.tipo === 'cobrar' && (
            <>
              <div>
                <label className="block text-content font-medium text-body mb-2">Fecha de Pago</label>
                <DateField
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-content font-medium text-body mb-2">Comprobante (opcional)</label>
                <input
                  type="file"
                  onChange={(e) => setComprobante(e.target.files?.[0] || null)}
                  className="w-full text-content text-subtext file:mr-3 file:py-1.5 file:px-3 file:rounded-control file:border-0 file:text-content file:bg-row file:text-subtext hover:file:bg-row-alt"
                />
                <p className="text-eyebrow text-faint mt-2">Si adjuntas una imagen pesada, se intentará reducir antes de subirla. PDFs y otros archivos deben ser menores a 4 MB.</p>
              </div>
            </>
          )}

          {props.tipo === 'pagar' && (
            <p className="text-eyebrow text-faint -mt-1">Si adjuntas una imagen pesada, se intentará reducir antes de subirla. PDFs y otros archivos deben ser menores a 4 MB.</p>
          )}

          <div>
            <label className="block text-content font-medium text-body mb-2">Notas (opcional)</label>
            <textarea
              placeholder="Agregar notas sobre el pago..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full px-3 py-2 bg-input border border-hairline rounded-control text-body placeholder-faint h-20 focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 px-4 bg-accent hover:bg-accent-pressed disabled:opacity-50 text-accent-ink rounded-control text-content font-medium transition-colors"
          >
            {saving ? 'Registrando...' : 'Registrar Pago'}
          </button>
        </form>
      )}

      {props.tipo === 'cobrar' && props.pagos.length > 0 && (
        <div className="pt-6 border-t border-hairline">
          <h4 className="font-semibold text-ink mb-3">Historial de Pagos</h4>
          <div className="space-y-2">
            {props.pagos.map((pago) => (
              <div key={pago.id} className="flex justify-between items-center p-3 bg-row rounded-control">
                <div>
                  <p className="text-ink text-content font-medium">
                    {formatDateDisplay(pago.fecha_pago)}
                  </p>
                  <p className="text-subtext text-eyebrow">
                    ${fmt(pago.monto)} - {pago.tipo_pago === 'TRANSFERENCIA' ? 'Transferencia' : 'Efectivo'}
                    {pago.notas && ` - ${pago.notas}`}
                  </p>
                </div>
                {pago.comprobante_url && (
                  <a
                    href={pago.comprobante_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent-pressed text-content"
                  >
                    Ver
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
