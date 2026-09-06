import * as React from 'react';

/** Row under a table: "Mostrando X de Y" on the left, results-per-page select on the right. */
export interface TableFooterProps {
  shown?: number;
  total?: number;
  perPage?: number;
  perPageOptions?: number[];
  onPerPageChange?: (perPage: number) => void;
  /** Leading word of the count phrase. Default "Mostrando". */
  label?: string;
  style?: React.CSSProperties;
}

export declare function TableFooter(props: TableFooterProps): JSX.Element;
