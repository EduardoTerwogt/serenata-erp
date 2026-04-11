'use client'

import Link from 'next/link'
import PendientesTable from '../components/PendientesTable'

export default function PendientesPage() {
  return (
    <div className="px-5 pt-6 pb-6 md:p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Pendientes de Planeación</h1>
          <p className="text-gray-400">
            Revisa las filas marcadas como "Por Confirmar" o "Cancelado"
          </p>
        </div>
        <Link
          href="/planeacion"
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors"
        >
          ← Volver a Planeación
        </Link>
      </div>

      {/* Table component */}
      <div className="max-w-6xl mx-auto">
        <PendientesTable />
      </div>
    </div>
  )
}
