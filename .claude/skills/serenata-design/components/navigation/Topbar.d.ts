import * as React from 'react';

/** Content-area header strip: transparent, right-aligned, user block only. No global search, no theme switch. */
export interface TopbarUser { name: string; nickname?: string; initials?: string }

export interface TopbarProps {
  user?: TopbarUser;
  /** Optional content pinned to the left of the strip (breadcrumbs, view switch). */
  left?: React.ReactNode;
  /** Optional controls placed before the user block. */
  right?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function Topbar(props: TopbarProps): JSX.Element;
