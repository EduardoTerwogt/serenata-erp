import * as React from 'react';

/**
 * Barras agrupadas sin ejes ni cuadrícula: el lenguaje de gráficas del sistema.
 * Naranja de marca para la serie principal, teal de la textura para la segunda.
 *
 * @startingPoint section="Patrones" subtitle="Barras agrupadas con tooltip, sin ejes" viewport="700x260"
 */
export interface ChartSeries {
  /** Propiedad del dato que se grafica. */
  key: string;
  /** Nombre en la leyenda y el tooltip. */
  label: string;
  /** Color CSS. Usa var(--accent) y var(--sn-texture-teal). */
  color: string;
}

export interface BarChartProps {
  data: Array<Record<string, any>>;
  /** Series a graficar. Dos como máximo. */
  series?: ChartSeries[];
  /** Propiedad que da la etiqueta del eje X. */
  labelKey?: string;
  height?: number;
  /** Navega a la sección de detalle del periodo. */
  onBarClick?: (d: Record<string, any>) => void;
  /** Formatea el valor del tooltip. */
  format?: (v: any) => React.ReactNode;
  style?: React.CSSProperties;
}

export declare function BarChart(props: BarChartProps): JSX.Element;

export interface ChartLegendProps {
  series?: ChartSeries[];
  style?: React.CSSProperties;
}

export declare function ChartLegend(props: ChartLegendProps): JSX.Element;

export declare const SERIES_DEFAULT: ChartSeries[];
