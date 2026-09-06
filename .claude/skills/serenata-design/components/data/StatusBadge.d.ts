import * as React from 'react';

/** Pill badge for quote status. Soft dark tint background with a lighter same-hue label. */
export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** aprobada (green), emitida (blue), borrador (grey), cancelada (terracotta). */
  status?: 'aprobada' | 'emitida' | 'borrador' | 'cancelada';
  /** Override the visible label; the tone still comes from status. */
  children?: React.ReactNode;
}

export declare function StatusBadge(props: StatusBadgeProps): JSX.Element;
