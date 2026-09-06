import * as React from 'react';

/**
 * Capa modal centrada. El sistema no tiene panel lateral: los detalles, los
 * editores y las confirmaciones se abren aquí.
 */
export interface ModalProps {
  title: React.ReactNode;
  /** Contexto arriba del título: folio, cliente, sección. */
  eyebrow?: React.ReactNode;
  onClose: () => void;
  children?: React.ReactNode;
  /** Barra inferior. Pon un spacer flexible antes de los botones de acción. */
  footer?: React.ReactNode;
  /** Ancho máximo en px. 480 confirmaciones, 720 detalle, 980 editores. */
  width?: number;
  style?: React.CSSProperties;
}

export declare function Modal(props: ModalProps): JSX.Element;
