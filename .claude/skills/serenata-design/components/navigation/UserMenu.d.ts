import * as React from 'react';

/** Topbar identity block: orange initials avatar, full name, nickname. No dropdown chevron — there is no user menu. */
export interface UserMenuProps {
  name?: string;
  /** Second line — the person's nickname from the Usuarios section, not their job title. */
  nickname?: string;
  /** Override the initials derived from name. */
  initials?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export declare function UserMenu(props: UserMenuProps): JSX.Element;
