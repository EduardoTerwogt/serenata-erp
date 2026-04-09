import { ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full font-medium transition-colors duration-200',
  {
    variants: {
      variant: {
        default: 'bg-gray-800 text-gray-100 border border-gray-700',
        primary: 'bg-blue-900/30 text-blue-300 border border-blue-800/50',
        secondary: 'bg-gray-800 text-gray-100 border border-gray-700',
        success: 'bg-green-900/30 text-green-300 border border-green-800/50',
        warning: 'bg-yellow-900/30 text-yellow-300 border border-yellow-800/50',
        error: 'bg-red-900/30 text-red-300 border border-red-800/50',
        info: 'bg-cyan-900/30 text-cyan-300 border border-cyan-800/50',
        accent: 'bg-orange-900/30 text-orange-300 border border-orange-800/50',
        outline: 'border border-gray-700 text-gray-300 bg-transparent',
      },
      size: {
        xs: 'px-2 py-1 text-xs',
        sm: 'px-2.5 py-1 text-xs',
        md: 'px-3 py-1.5 text-sm',
        lg: 'px-4 py-2 text-sm',
      },
      fill: {
        true: 'border-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  }
)

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
  children: ReactNode
  icon?: ReactNode
  removable?: boolean
  onRemove?: () => void
}

export function Badge({
  className,
  variant,
  size,
  fill,
  children,
  icon,
  removable,
  onRemove,
  ...props
}: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant, size, fill }), className)}
      {...props}
    >
      {icon && <span className="inline-flex">{icon}</span>}
      {children}
      {removable && (
        <button
          onClick={onRemove}
          className="ml-1 text-current opacity-70 hover:opacity-100 focus:outline-none"
          type="button"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  )
}
