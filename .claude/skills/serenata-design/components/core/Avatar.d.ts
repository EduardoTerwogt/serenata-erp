import * as React from 'react';

/** Circular initials avatar — white bold letters on brand orange. */
export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** One or two letters; longer strings are truncated. */
  initials?: string;
  /** Diameter in px. 38 in the topbar, 28 in table rows. */
  size?: number;
  tone?: 'accent' | 'neutral';
}

export declare function Avatar(props: AvatarProps): JSX.Element;
