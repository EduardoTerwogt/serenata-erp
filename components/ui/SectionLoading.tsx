import { SplashMark } from './SplashMark'

// Carga entre secciones (readme.md del skill): SplashMark centrado mientras
// se resuelve el fetch inicial de una pantalla -- en el kit es un tiempo fijo
// atado al cambio de sección; aquí se muestra mientras dura el fetch real.
export function SectionLoading({ className = '' }: { className?: string }) {
  return (
    <div className={`flex min-h-[360px] flex-1 items-center justify-center ${className}`.trim()}>
      <SplashMark size={200} />
    </div>
  )
}
