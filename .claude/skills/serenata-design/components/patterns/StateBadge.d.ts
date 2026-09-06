import * as React from 'react';

/**
 * Badge para estados que no son de cotización: proyecto, cuentas por cobrar y
 * por pagar, validación de documentos, activo/inactivo. Mapea cada estado sobre
 * los cuatro tonos que existen; el sistema no admite tonos nuevos.
 */
export interface StateBadgeProps {
  /** Clave del estado: RODAJE, VENCIDO, EN_PROCESO_PAGO, validado, ACTIVO… */
  state: string;
  /** Sobrescribe la etiqueta del mapa. */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function StateBadge(props: StateBadgeProps): JSX.Element;

export declare const STATE_MAP: Record<string, { tone: string; label: string }>;
