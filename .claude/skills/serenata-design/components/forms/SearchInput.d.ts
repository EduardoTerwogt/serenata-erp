import * as React from 'react';

/** Search field with a leading magnifier — global (pill) in the topbar, contextual (rounded) above tables. */
export interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'style'> {
  size?: 'md' | 'lg';
  /** Fully rounded track — used for the global topbar search. */
  pill?: boolean;
  fullWidth?: boolean;
  style?: React.CSSProperties;
}

export declare function SearchInput(props: SearchInputProps): JSX.Element;
