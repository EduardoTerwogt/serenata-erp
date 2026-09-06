import * as React from 'react';

/**
 * The product's list table: uppercase micro-label header, generously padded rows
 * separated by space rather than divider lines.
 */
export interface DataTableColumn {
  key: string;
  label: string;
  /** CSS grid track, e.g. "1.4fr" or "120px". Defaults to 1fr. */
  width?: string;
  align?: 'left' | 'right' | 'center';
  /** Render the cell as semibold (used for the folio / primary column). */
  strong?: boolean;
  render?: (row: any) => React.ReactNode;
}

export interface DataTableProps {
  columns?: DataTableColumn[];
  rows?: any[];
  onRowClick?: (row: any) => void;
  emptyLabel?: string;
  /** Minimum grid width before the table scrolls horizontally. Default 1000. */
  minWidth?: number;
  style?: React.CSSProperties;
}

export declare function DataTable(props: DataTableProps): JSX.Element;
