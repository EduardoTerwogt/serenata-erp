import * as React from 'react';

/** Secondary button that opens a filter menu; shows an orange count pill when filters are applied. */
export interface FilterButtonProps {
  children?: React.ReactNode;
  /** Number of active filters. Omit or 0 to hide the pill. */
  count?: number;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export declare function FilterButton(props: FilterButtonProps): JSX.Element;
