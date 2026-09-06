import * as React from 'react';

/**
 * Serenata's action button. Primary is the brand orange CTA ("Nueva cotización");
 * secondary is the quiet surface button used for filters and pagination.
 */
export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  children?: React.ReactNode;
  /** primary = orange CTA, secondary = surface + hairline, ghost = text only. */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** lg (48px) for CTAs and heroes, md (42px) for toolbars and table controls. */
  size?: 'md' | 'lg';
  /** Lucide icon name rendered before the label. */
  iconLeft?: string;
  /** Lucide icon name rendered after the label (usually "chevron-down"). */
  iconRight?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: React.CSSProperties;
}

export declare function Button(props: ButtonProps): JSX.Element;
