import * as React from 'react';

/**
 * Section header card: brand-texture background under a dark scrim, orange eyebrow,
 * giant uppercase display title, muted subtitle and a right-aligned CTA.
 */
export interface SectionHeroProps {
  /** Small uppercase orange kicker above the title. */
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Usually a primary Button, vertically centred against the text block. */
  action?: React.ReactNode;
  minHeight?: number;
  style?: React.CSSProperties;
}

export declare function SectionHero(props: SectionHeroProps): JSX.Element;
