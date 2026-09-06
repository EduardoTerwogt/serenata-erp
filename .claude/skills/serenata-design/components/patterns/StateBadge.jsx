import React from 'react';
import { StatusBadge } from '../data/StatusBadge.jsx';

/* El sistema tiene cuatro tonos de badge y no se deben agregar más. StateBadge
   mapea los estados de proyecto, de cuentas y de validación de documentos sobre
   esos cuatro. Para agregar un estado nuevo, súmalo aquí en vez de inventar un
   color. */
export const STATE_MAP = {
  PREPRODUCCIÓN: { tone: 'borrador', label: 'Preproducción' },
  RODAJE: { tone: 'emitida', label: 'Rodaje' },
  POSTPRODUCCIÓN: { tone: 'emitida', label: 'Postproducción' },
  FINALIZADO: { tone: 'aprobada', label: 'Finalizado' },
  FACTURA_PENDIENTE: { tone: 'borrador', label: 'Factura pendiente' },
  FACTURADO: { tone: 'emitida', label: 'Facturado' },
  PARCIALMENTE_PAGADO: { tone: 'emitida', label: 'Parcial' },
  PAGADO: { tone: 'aprobada', label: 'Pagado' },
  VENCIDO: { tone: 'cancelada', label: 'Vencido' },
  PENDIENTE: { tone: 'borrador', label: 'Pendiente' },
  EN_PROCESO_PAGO: { tone: 'emitida', label: 'En proceso' },
  ACTIVO: { tone: 'aprobada', label: 'Activo' },
  INACTIVO: { tone: 'borrador', label: 'Inactivo' },
  validado: { tone: 'aprobada', label: 'Validado' },
  revision: { tone: 'emitida', label: 'En revisión' },
  pendiente: { tone: 'borrador', label: 'Pendiente' },
  rechazado: { tone: 'cancelada', label: 'Rechazado' },
};

export function StateBadge({ state, children, style, ...rest }) {
  const s = STATE_MAP[state] || { tone: 'borrador', label: String(state) };
  return <StatusBadge status={s.tone} style={style} {...rest}>{children || s.label}</StatusBadge>;
}
