import { ButtonHTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'
import { Icon, type IconName } from './Icon'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'md' | 'lg'

interface BaseProps {
  children: ReactNode
  variant?: Variant
  size?: Size
  iconLeft?: IconName
  iconRight?: IconName
  fullWidth?: boolean
  className?: string
}

interface ButtonAsButton extends BaseProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps> {
  href?: undefined
}

interface ButtonAsLink extends BaseProps {
  href: string
  target?: string
  rel?: string
}

type ButtonProps = ButtonAsButton | ButtonAsLink

// Puerto de core/Button.jsx del kit: mismos 3 variants (primary/secondary/
// ghost), mismos 2 tamaños (md/lg), iconLeft/iconRight en vez de un solo
// `icon`. Hover/press vía Tailwind en vez de estado de React -- mismo
// resultado visual, menos código. `href` lo renderiza como Link de Next en
// vez de <button>, para los CTA que navegan (ej. "Nueva cotización").
const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink font-semibold hover:bg-accent-pressed',
  secondary: 'border border-hairline bg-input text-body font-medium hover:bg-row-alt',
  ghost: 'text-subtext font-medium hover:bg-[var(--hover-overlay)] hover:text-body',
}

const SIZE_CLASS: Record<Size, string> = {
  md: 'h-[var(--control-height)] px-3.5 text-[length:var(--text-md)]',
  lg: 'h-[var(--control-height-lg)] px-[18px] text-[length:var(--text-md)]',
}

const ICON_SIZE: Record<Size, number> = { md: 14, lg: 15 }

export function Button({ children, variant = 'primary', size = 'lg', iconLeft, iconRight, fullWidth, className = '', href, ...rest }: ButtonProps) {
  const classes = `inline-flex items-center justify-center gap-[6px] rounded-control tracking-[0.01em] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${fullWidth ? 'w-full' : ''} ${className}`

  const content = (
    <>
      {iconLeft && <Icon name={iconLeft} size={ICON_SIZE[size]} />}
      {children}
      {iconRight && <Icon name={iconRight} size={ICON_SIZE[size] - 1} />}
    </>
  )

  if (href) {
    const { target, rel } = rest as { target?: string; rel?: string }
    return (
      <Link href={href} className={classes} target={target} rel={rel}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" className={classes} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {content}
    </button>
  )
}
