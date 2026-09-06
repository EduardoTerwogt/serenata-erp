import * as React from 'react';

/** Compact dropdown on the row surface with a subtle hairline and muted chevron. */
export interface SelectOption { value: string | number; label: string }

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'style'> {
  options?: Array<SelectOption | string | number>;
  /** sm (34px) for table footers, md (42px) inside toolbars. */
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

export declare function Select(props: SelectProps): JSX.Element;
