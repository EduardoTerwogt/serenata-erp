import React from 'react';

/* Un folio (SH014, COT-2451, F-2291) es un dato "tipo código" y debe leerse
   distinto al resto del texto. El sistema no tiene familia monoespaciada, así
   que se resuelve con la display face en tamaño pequeño y tracking abierto. */
export function Folio({ children, size = 13, color = 'var(--text-body)', style, ...rest }) {
  return (
    <span
      className="sn-display"
      style={{ fontSize: size, letterSpacing: '0.06em', color, display: 'inline-block', ...style }}
      {...rest}
    >{children}</span>
  );
}
