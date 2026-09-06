import * as React from 'react';

/**
 * Tarjeta con encabezado opcional y una zona de acciones a la derecha. Es el
 * contenedor de sección que usa cada pantalla del producto.
 */
export interface PanelProps {
  /** Título del panel, en 19px semibold. */
  title?: React.ReactNode;
  /** Kicker naranja en mayúsculas, arriba del título. */
  eyebrow?: React.ReactNode;
  /** Controles alineados a la derecha del encabezado. Envuelven si no caben. */
  action?: React.ReactNode;
  children?: React.ReactNode;
  /** Padding del cuerpo. Usa "0" cuando el contenido es una tabla a sangre. */
  padding?: string;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}

export declare function Panel(props: PanelProps): JSX.Element;
