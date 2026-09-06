import * as React from 'react';

/** One row of the sidebar navigation. The active row is a solid orange block. */
export interface NavItemProps {
  /** Lucide icon name shown before the label. */
  icon?: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export declare function NavItem(props: NavItemProps): JSX.Element;
