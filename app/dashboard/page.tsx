import { getCotizaciones, getCuentasCobrar, getCuentasPagar } from '@/lib/db'

export default async function DashboardPage() {
  const [resCot, resCobrar, resPagar] = await Promise.allSettled([
    getCotizaciones(),
    getCuentasCobrar(),
    getCuentasPagar(),
  ])

  const queryErrors = [
    resCot.status === 'rejected' ? `getCotizaciones: ${JSON.stringify(resCot.reason)}` : null,
    resCobrar.status === 'rejected' ? `getCuentasCobrar: ${JSON.stringify(resCobrar.reason)}` : null,
    resPagar.status === 'rejected' ? `getCuentasPagar: ${JSON.stringify(resPagar.reason)}` : null,
  ].filter(Boolean)

  const cotizaciones = resCot.status === 'fulfilled' ? resCot.value : []
  const cuentasCobrar = resCobrar.status === 'fulfilled' ? resCobrar.value : []
  const cuentasPagar = resPagar.status === 'fulfilled' ? resPagar.value : []

  const totalCobrar = cuentasCobrar
    ?.filter((c: any) => c.estado !== 'PAGADO')
    .reduce((sum: number, c: any) => sum + c.monto_total, 0) || 0

  const totalPagar = cuentasPagar
    ?.filter((c: any) => c.estado !== 'PAGADO')
    .reduce((sum: number, c: any) => sum + c.x_pagar, 0) || 0

  const cotizacionesAprobadas = cotizaciones?.filter(c => c.estado === 'APROBADA').length || 0
  const cotizacionesBorrador = cotizaciones?.filter(c => c.estado === 'BORRADOR').length || 0

  return (
    <div className="px-5 pt-6 pb-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">Resumen general de Serenata</p>
      </div>

      {queryErrors.length > 0 && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-4 py-4 mb-6">
          <p className="font-semibold mb-2">Error en consultas de Supabase — verifica columnas faltantes:</p>
          {queryErrors.map((e, i) => (
            <p key={i} className="text-xs font-mono break-all">{e}</p>
          ))}
          <p className="text-xs mt-3 text-red-400">
            Si el error menciona una columna faltante, ejecuta el SQL correspondiente en Supabase.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6">
          <p className="text-gray-400 text-xs md:text-sm">Por Cobrar</p>
          <p className="text-xl md:text-2xl font-bold text-green-400 mt-2">
            ${totalCobrar.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-gray-500 text-xs mt-1">Pendiente de pago</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6">
          <p className="text-gray-400 text-xs md:text-sm">Por Pagar</p>
          <p className="text-xl md:text-2xl font-bold text-red-400 mt-2">
            ${totalPagar.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-gray-500 text-xs mt-1">A colaboradores</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6">
          <p className="text-gray-400 text-xs md:text-sm">Cotizaciones Aprobadas</p>
          <p className="text-xl md:text-2xl font-bold text-blue-400 mt-2">{cotizacionesAprobadas}</p>
          <p className="text-gray-500 text-xs mt-1">Proyectos activos</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6">
          <p className="text-gray-400 text-xs md:text-sm">En Borrador</p>
          <p className="text-xl md:text-2xl font-bold text-yellow-400 mt-2">{cotizacionesBorrador}</p>
          <p className="text-gray-500 text-xs mt-1">Sin enviar</p>
        </div>
      </div>

      <div className="hidden md:block bg-gray-900 border border-gray-800 rounded-xl">
        <div className="p-6 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Cotizaciones Recientes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-400 text-sm font-medium px-6 py-3">Folio</th>
                <th className="text-left text-gray-400 text-sm font-medium px-6 py-3">Cliente</th>
                <th className="text-left text-gray-400 text-sm font-medium px-6 py-3">Proyecto</th>
                <th className="text-left text-gray-400 text-sm font-medium px-6 py-3">Total</th>
                <th className="text-left text-gray-400 text-sm font-medium px-6 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {cotizaciones?.slice(0, 10).map((cot) => (
                <tr key={cot.id} className="border-b border-gray-800 hover:bg-gray-800 transition-colors">
                  <td className="px-6 py-4 text-sm font-mono text-blue-400">{cot.id}</td>
                  <td className="px-6 py-4 text-sm text-gray-300">{cot.cliente}</td>
                  <td className="px-6 py-4 text-sm text-gray-300">{cot.proyecto}</td>
                  <td className="px-6 py-4 text-sm text-white font-medium">
                    ${(cot.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      cot.estado === 'APROBADA' ? 'bg-green-900 text-green-300' :
                      cot.estado === 'ENVIADA' ? 'bg-blue-900 text-blue-300' :
                      'bg-yellow-900 text-yellow-300'
                    }`}>
                      {cot.estado}
                    </span>
                  </td>
                </tr>
              ))}
              {(!cotizaciones || cotizaciones.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No hay cotizaciones aún
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="md:hidden">
        <h2 className="text-lg font-semibold text-white mb-4">Cotizaciones Recientes</h2>
        <div className="space-y-3">
          {cotizaciones?.slice(0, 10).map((cot) => (
            <a
              key={cot.id}
              href={`/cotizaciones/${cot.id}`}
              className="block bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-mono text-blue-400 font-bold text-sm">{cot.id}</span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  cot.estado === 'APROBADA' ? 'bg-green-900 text-green-300' :
                  cot.estado === 'ENVIADA' ? 'bg-blue-900 text-blue-300' :
                  'bg-yellow-900 text-yellow-300'
                }`}>
                  {cot.estado}
                </span>
              </div>
              <p className="text-white font-medium text-[15px] mb-1">{cot.proyecto}</p>
              <p className="text-gray-500 text-sm mb-3">{cot.cliente}</p>
              <div className="flex justify-between items-center">
                <span className="text-white font-bold text-lg">
                  ${(cot.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </a>
          ))}
          {(!cotizaciones || cotizaciones.length === 0) && (
            <p className="text-center text-gray-500 py-6">No hay cotizaciones aún</p>
          )}
        </div>
      </div>
    </div>
  )
}
