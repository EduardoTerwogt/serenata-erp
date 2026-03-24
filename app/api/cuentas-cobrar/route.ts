import { getCuentasCobrar, updateCuentaCobrar } from '@/lib/db'

export async function GET() {
  try {
    const cuentas = await getCuentasCobrar()
    return Response.json(cuentas)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo cuentas por cobrar' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, ...updates } = body
    if (!id) return Response.json({ error: 'ID requerido' }, { status: 400 })
    const cuenta = await updateCuentaCobrar(id, updates)
    return Response.json(cuenta)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando cuenta por cobrar' }, { status: 500 })
  }
}
