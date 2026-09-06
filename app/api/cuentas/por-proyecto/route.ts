import { requireSection } from '@/lib/api-auth'
import { getProyectos, getCuentasCobrar, getCuentasPagar } from '@/lib/db'
import type { CuentaCobrar, CuentaPagar } from '@/lib/types'

interface ProyectoConCuentas {
  proyecto: {
    id: string
    folio: string
    nombre: string
    cliente: string
    estado: string
  }
  cuentas_cobrar: CuentaCobrar[]
  cuentas_pagar: CuentaPagar[]
  total_cobrar: number
  total_pagar: number
}

// Vista "Por proyecto" de CuentasScreen.jsx: acordeón por proyecto con sus
// cuentas por cobrar y por pagar. cuentas_cobrar.proyecto_id y
// cuentas_pagar.proyecto_id ya resuelven la misma regla (complementarias
// cuelgan del proyecto de su principal) desde Bloque 1, así que aquí solo
// se agrupa -- ninguna lógica de negocio nueva.
export async function GET() {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const [proyectos, cuentasCobrar, cuentasPagar] = await Promise.all([
      getProyectos(),
      getCuentasCobrar(),
      getCuentasPagar(),
    ])

    const porProyecto = new Map<string, ProyectoConCuentas>()

    for (const proyecto of proyectos) {
      porProyecto.set(proyecto.id, {
        proyecto: {
          id: proyecto.id,
          folio: proyecto.id,
          nombre: proyecto.proyecto,
          cliente: proyecto.cliente,
          estado: proyecto.estado,
        },
        cuentas_cobrar: [],
        cuentas_pagar: [],
        total_cobrar: 0,
        total_pagar: 0,
      })
    }

    for (const cuenta of cuentasCobrar) {
      const grupo = cuenta.proyecto_id ? porProyecto.get(cuenta.proyecto_id) : undefined
      if (!grupo) continue
      grupo.cuentas_cobrar.push(cuenta)
      grupo.total_cobrar += Number(cuenta.monto_total || 0)
    }

    for (const cuenta of cuentasPagar) {
      const grupo = cuenta.proyecto_id ? porProyecto.get(cuenta.proyecto_id) : undefined
      if (!grupo) continue
      grupo.cuentas_pagar.push(cuenta)
      grupo.total_pagar += Number(cuenta.x_pagar || 0)
    }

    // Solo proyectos con al menos una cuenta -- un proyecto recién
    // aprobado sin items x_pagar>0 y sin cuenta_cobrar (caso raro) no
    // aporta nada a esta vista.
    const resultado = Array.from(porProyecto.values()).filter(
      (grupo) => grupo.cuentas_cobrar.length > 0 || grupo.cuentas_pagar.length > 0
    )

    return Response.json({ proyectos: resultado })
  } catch (error) {
    console.error('[cuentas/por-proyecto][GET]', error)
    return Response.json({ error: 'Error agrupando cuentas por proyecto' }, { status: 500 })
  }
}
