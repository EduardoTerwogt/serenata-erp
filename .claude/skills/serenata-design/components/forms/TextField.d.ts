import * as React from 'react';

/** Labelled single-line input. Label uses the uppercase micro-label style. */
export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'style'> {
  label?: string;
  hint?: string;
  fullWidth?: boolean;
  style?: React.CSSProperties;
}

export declare function TextField(props: TextFieldProps): JSX.Element;
