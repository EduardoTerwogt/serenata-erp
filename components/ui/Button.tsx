import { ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        primary: 'bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-700 hover:to-blue-600 active:from-blue-800 active:to-blue-700 focus-visible:ring-blue-500 shadow-elevation-2 hover:shadow-elevation-3',
        secondary: 'bg-gray-800 text-gray-100 hover:bg-gray-700 active:bg-gray-800 focus-visible:ring-gray-500 border border-gray-700 hover:border-gray-600',
        destructive: 'bg-red-900/20 text-red-400 hover:bg-red-900/30 active:bg-red-900/40 focus-visible:ring-red-500 border border-red-800/50 hover:border-red-700/50',
        ghost: 'text-gray-300 hover:bg-gray-800/50 hover:text-white active:bg-gray-700/50 focus-visible:ring-gray-500',
        outline: 'border border-gray-700 text-gray-300 hover:bg-gray-800/50 hover:text-white active:bg-gray-700/50 focus-visible:ring-gray-500',
        accent: 'bg-gradient-to-r from-orange-600 to-orange-500 text-white hover:from-orange-700 hover:to-orange-600 active:from-orange-800 active:to-orange-700 focus-visible:ring-orange-500 shadow-elevation-2 hover:shadow-elevation-3',
        success: 'bg-gradient-to-r from-green-600 to-green-500 text-white hover:from-green-700 hover:to-green-600 active:from-green-800 active:to-green-700 focus-visible:ring-green-500 shadow-elevation-2 hover:shadow-elevation-3',
        glass: 'bg-white/10 backdrop-blur-md text-white hover:bg-white/20 active:bg-white/30 focus-visible:ring-white border border-white/20 hover:border-white/30 shadow-glass',
      },
      size: {
        xs: 'h-8 px-2.5 text-xs',
        sm: 'h-9 px-3 text-sm',
        md: 'h-10 px-4 text-base',
        lg: 'h-11 px-5 text-base',
        xl: 'h-12 px-6 text-lg',
        icon: 'h-10 w-10 p-0',
        'icon-sm': 'h-8 w-8 p-0',
        'icon-lg': 'h-12 w-12 p-0',
      },
      fullWidth: {
        true: 'w-full',
      },
      loading: {
        true: 'disabled',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  children: ReactNode
  isLoading?: boolean
  icon?: ReactNode
}

export function Button({
  className,
  variant,
  size,
  fullWidth,
  isLoading,
  disabled,
  children,
  icon,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, fullWidth, loading: isLoading }), className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </>
      ) : (
        <>
          {icon && <span className="inline-flex">{icon}</span>}
          {children}
        </>
      )}
    </button>
  )
}
