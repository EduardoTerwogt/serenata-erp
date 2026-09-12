/**
 * Extraído de TabRegistrarPago.tsx (Engineering Hardening EF-1, 1E-3b/c):
 * la orquestación de idempotencia (fingerprint sobre el comprobante
 * ORIGINAL, antes de normalizar) ahora vive en los hooks
 * (useCuentasPagar/useCuentasCobrar), no en el componente Tab -- así que
 * la normalización debe ser importable desde ahí también, sin cambiar en
 * absoluto su comportamiento.
 */
const MAX_COMPROBANTE_BYTES = 3.5 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 1600
const JPEG_QUALITIES = [0.82, 0.72, 0.62, 0.52, 0.42]

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

export async function normalizeComprobante(file: File): Promise<File> {
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
