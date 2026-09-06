import * as React from 'react';

/** Base surface container: near-invisible hairline, large radius, no drop shadow. */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  /** CSS padding value. Default var(--space-lg). */
  padding?: string;
  /** CSS radius. var(--radius-lg) for panels, var(--radius-md) for inner blocks. */
  radius?: string;
  tone?: 'surface' | 'row' | 'app';
}

export declare function Card(props: CardProps): JSX.Element;
