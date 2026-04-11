import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const pendientes = Array.isArray(body) ? body : [body]

    if (pendientes.length === 0) {
      return NextResponse.json({ success: true, inserted: 0 })
    }

    // Insertar filas de pendientes en batch
    const { data, error } = await supabaseAdmin
      .from('planeacion_pendientes')
      .insert(
        pendientes.map((p) => ({
          cliente: p.cliente,
          proyecto: p.proyecto,
          fecha: p.fecha || null,
          fecha_iso: p.fecha_iso || null,
          ciudad: p.ciudad || null,
          locacion: p.locacion || null,
          estado: p.estado, // 'por_confirmar' | 'cancelado'
          raw_input: p.raw_input || null,
        }))
      )

    if (error) {
      console.error('Error inserting planeacion_pendientes:', error)
      return NextResponse.json(
        { error: 'Failed to save pendientes' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      inserted: pendientes.length,
    })
  } catch (err) {
    console.error('POST /api/planeacion/pendientes error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
