import React from 'react';

/* Un folio (SH014, COT-2451, F-2291) es un dato "tipo código" y debe leerse
   distinto al resto del texto. El sistema no tiene familia monoespaciada, así
   que se resuelve con la display face en tamaño pequeño y tracking abierto. */
export function Folio({ children, size = 12.5, color = 'var(--text-primary)', style, ...rest }) {
  return (
    <span
      style={{ fontFamily: 'var(--font-ui)', fontSize: size, fontWeight: 'var(--weight-semibold)', color, display: 'inline-block', ...style }}
      {...rest}
    >{children}</span>
  );
}
