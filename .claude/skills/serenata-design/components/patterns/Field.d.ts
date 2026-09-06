import * as React from 'react';

/**
 * Par etiqueta + valor. Con children envuelve un control; sin children pinta el
 * valor como texto de lectura.
 */
export interface FieldProps {
  label: React.ReactNode;
  /** Valor de solo lectura. Se ignora si pasas children. */
  value?: React.ReactNode;
  /** Un control editable: input, Select, textarea. */
  children?: React.ReactNode;
  /** Columnas que ocupa dentro de un grid. */
  span?: number;
  /** Evita que la etiqueta se parta en dos líneas, para que los valores de una
   *  fila queden en la misma línea base. */
  nowrapLabel?: boolean;
  style?: React.CSSProperties;
}

export declare function Field(props: FieldProps): JSX.Element;
