import * as React from 'react';

/**
 * Tarjeta de métrica: label en micro-mayúsculas, cifra grande en display face y
 * una nota opcional. Clicable cuando lleva a la sección de detalle.
 */
export interface MetricProps {
  /** Etiqueta en mayúsculas, 10px. */
  label: React.ReactNode;
  /** La cifra. Formatéala antes de pasarla. */
  value: React.ReactNode;
  /** Segunda línea de contexto: "4 cuentas abiertas". */
  nota?: React.ReactNode;
  /** Pinta la cifra en naranja. Úsalo en una sola tarjeta por fila. */
  accent?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export declare function Metric(props: MetricProps): JSX.Element;
