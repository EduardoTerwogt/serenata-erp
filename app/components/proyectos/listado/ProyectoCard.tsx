import Link from 'next/link'
import type { Proyecto } from '@/lib/types'

interface ProyectoCardProps {
  proyecto: Proyecto
}

export function ProyectoCard({ proyecto }: ProyectoCardProps) {
  return (
    <Link
      href={`/proyectos/${proyecto.id}`}
      className="block bg-row border border-hairline rounded-control p-3 hover:bg-row-alt transition-colors"
    >
      <p className="text-eyebrow font-mono text-accent">{proyecto.id}</p>
      <p className="text-content font-bold text-ink mt-0.5">{proyecto.proyecto}</p>
      <p className="text-eyebrow text-subtext mt-0.5">{proyecto.cliente}</p>
    </Link>
  )
}
