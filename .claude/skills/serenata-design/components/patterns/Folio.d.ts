import * as React from 'react';

/**
 * Folio o identificador tipo código (SH014, COT-2451, F-2291) en la display
 * face con tracking abierto, para que se lea distinto al texto de la fila.
 */
export interface FolioProps {
  children: React.ReactNode;
  /** Tamaño en px. 13 en tablas, 12 en tarjetas, 15 en encabezados de modal. */
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}

export declare function Folio(props: FolioProps): JSX.Element;
