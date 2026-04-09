import { ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'border-gray-800/50 bg-gray-900/50 text-gray-100',
        success: 'border-green-800/50 bg-green-900/20 text-green-300',
        warning: 'border-yellow-800/50 bg-yellow-900/20 text-yellow-300',
        error: 'border-red-800/50 bg-red-900/20 text-red-300',
        info: 'border-cyan-800/50 bg-cyan-900/20 text-cyan-300',
        primary: 'border-blue-800/50 bg-blue-900/20 text-blue-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  children: ReactNode
  icon?: ReactNode
  title?: string
  description?: string
  closeable?: boolean
  onClose?: () => void
}

export function Alert({
  className,
  variant,
  children,
  icon,
  title,
  description,
  closeable,
  onClose,
  ...props
}: AlertProps) {
  return (
    <div className={cn(alertVariants({ variant }), className)} {...props}>
      {icon}
      <div className="flex-1">
        {title && <h3 className="font-semibold mb-1">{title}</h3>}
        {description && <p className="text-sm opacity-90">{description}</p>}
        {children}
      </div>
      {closeable && (
        <button
          onClick={onClose}
          className="absolute right-2 top-2 p-1 rounded hover:bg-white/10 transition-colors"
          type="button"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  )
}
