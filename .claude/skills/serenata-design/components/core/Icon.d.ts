import * as React from 'react';

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name' | 'color'> {
  /** Lucide icon name, kebab-case or PascalCase (e.g. "search", "chevron-down"). */
  name: string;
  /** Pixel box. Serenata uses 16 in dense rows, 18 in controls, 20 in nav. */
  size?: number;
  /** Stroke weight. Keep at 2 — the brand's outline icons are uniform. */
  strokeWidth?: number;
  color?: string;
}

export declare function Icon(props: IconProps): JSX.Element;
