import * as React from 'react';

/** Fixed left navigation: the square brand mark on top, label-only nav list, and a deliberately empty bottom area. */
export interface SidebarNavItem { id: string; label: string; icon?: string }

export interface SidebarProps {
  items?: SidebarNavItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  /** Optional bottom-pinned content. Left empty in the current design — reserved for a settings action. */
  footer?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function Sidebar(props: SidebarProps): JSX.Element;
