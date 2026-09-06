import * as React from 'react';

/**
 * Type-only stand-in for the Serenata identity. No logo files were provided with
 * the source material, so this renders the brand name (and the square mark's "S")
 * in the display face rather than reconstructing the real artwork.
 */
export interface WordmarkProps extends React.HTMLAttributes<HTMLDivElement> {
  /** mark = square "S" only (used in the sidebar), wordmark = name only, lockup = both. */
  variant?: 'mark' | 'wordmark' | 'lockup';
  tone?: 'orange' | 'white';
  /** Cap height in px; the square mark is 1.5× this. */
  size?: number;
}

export declare function Wordmark(props: WordmarkProps): JSX.Element;
