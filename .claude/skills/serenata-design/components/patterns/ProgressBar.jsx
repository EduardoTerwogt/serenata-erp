import React from 'react';

export function ProgressBar({ value = 0, height = 5, tone = 'var(--accent)', style, ...rest }) {
  return (
    <div style={{ height, borderRadius: 'var(--radius-pill)', background: 'var(--surface-input)', overflow: 'hidden', ...style }} {...rest}>
      <div style={{
        width: Math.max(0, Math.min(100, value)) + '%', height: '100%', background: tone,
        transition: 'width var(--dur-slow) var(--ease-standard)',
      }} />
    </div>
  );
}
