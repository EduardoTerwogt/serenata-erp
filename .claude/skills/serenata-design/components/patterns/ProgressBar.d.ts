import * as React from 'react';

/** Barra de avance de una sola pieza, sin etiqueta ni porcentaje encima. */
export interface ProgressBarProps {
  /** 0 a 100. Se recorta fuera de ese rango. */
  value: number;
  /** Alto en px. 5 en tarjetas, 7 en paneles de resumen. */
  height?: number;
  /** Color de la barra. Verde de estatus para "cubierto", naranja para faltante. */
  tone?: string;
  style?: React.CSSProperties;
}

export declare function ProgressBar(props: ProgressBarProps): JSX.Element;
