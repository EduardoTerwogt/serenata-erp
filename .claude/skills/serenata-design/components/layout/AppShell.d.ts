import * as React from 'react';

/** Two-column product frame: fixed sidebar + scrolling content column with its own topbar. */
export interface AppShellProps {
  sidebar?: React.ReactNode;
  topbar?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function AppShell(props: AppShellProps): JSX.Element;
