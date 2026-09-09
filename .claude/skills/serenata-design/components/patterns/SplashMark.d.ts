import * as React from 'react';

/**
 * Loader de marca: el isotipo "S" sale en blanco y una víbora de los colores
 * de la textura de marca la recorre de punta a punta en loop continuo. Para
 * esperas largas — inicio de sesión, cambio de sección con mucha información
 * — nunca para micro-interacciones (esas usan --transition-control).
 */
export interface SplashMarkProps {
  /** Tamaño del glifo en px. 200 pantalla completa, 120–140 dentro de una sección. */
  size?: number;
  style?: React.CSSProperties;
}

export declare function SplashMark(props: SplashMarkProps): JSX.Element;
