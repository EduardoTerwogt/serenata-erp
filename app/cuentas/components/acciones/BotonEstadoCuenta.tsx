'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/Button'
import { hasSection } from '@/lib/authz'
import type { LadoCuentas } from '@/lib/shared/cuentas/estado-cuenta-tipos'
import { EstadoCuenta } from './EstadoCuenta'

/**
 * Botón "Estado de cuenta" de las fichas de cliente y proveedor (#123, P28). Solo se muestra con la sección `cuentas`
 * en la sesión (las fichas exigen `cotizaciones` o `responsables`, que no la implican) y abre la misma ventana de
 * Acciones con la contraparte fija: una sola ventana y una sola consulta (P15).
 */
export function BotonEstadoCuenta({ lado, contraparteId }: { lado: LadoCuentas; contraparteId: string }) {
  const { data: session } = useSession()
  const [abierto, setAbierto] = useState(false)
  const secciones = (session?.user as { sections?: string[] } | undefined)?.sections
  if (!hasSection(secciones, 'cuentas')) return null
  return (
    <>
      <Button type="button" variant="secondary" size="md" iconLeft="file-text" onClick={() => setAbierto(true)}>
        Estado de cuenta
      </Button>
      {abierto && <EstadoCuenta lado={lado} contraparteId={contraparteId} doc={null} fija onClose={() => setAbierto(false)} />}
    </>
  )
}
