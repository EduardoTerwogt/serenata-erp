import * as React from 'react';

/** Segmented pill row used to filter a list ("Todas", "Borrador", "Emitidas"…). */
export interface FilterTab { id: string; label: string; count?: number }

export interface FilterTabsProps {
  tabs?: Array<FilterTab | string>;
  value?: string;
  onChange?: (id: string) => void;
  style?: React.CSSProperties;
}

export declare function FilterTabs(props: FilterTabsProps): JSX.Element;
