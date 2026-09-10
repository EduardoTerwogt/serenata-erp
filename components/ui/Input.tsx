import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  description?: string
  error?: string
  icon?: ReactNode
  helper?: string
  required?: boolean
}

export const Input = ({
  className,
  label,
  description,
  error,
  icon,
  helper,
  required,
  disabled,
  type = 'text',
  ...props
}: InputProps) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-200 mb-2">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}

      {description && (
        <p className="text-xs text-gray-400 mb-2">{description}</p>
      )}

      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            {icon}
          </div>
        )}

        <input
          type={type}
          disabled={disabled}
          className={cn(
            'w-full px-4 py-2.5 rounded-lg',
            'bg-gray-900/50 border border-gray-800/50',
            'text-gray-100 placeholder-gray-500',
            'transition-all duration-200',
            'focus:outline-none focus:border-blue-500/50 focus:bg-gray-900/80 focus:ring-1 focus:ring-blue-500/30',
            'hover:border-gray-700/50',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-900/30',
            error && 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/30',
            icon && 'pl-10',
            className
          )}
          {...props}
        />
      </div>

      {error && (
        <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18.101 12.93a1 1 0 0 0-1.414-1.414L11 16.172V4a1 1 0 1 0-2 0v12.172l-5.687-5.687a1 1 0 0 0-1.414 1.414l8 8a1 1 0 0 0 1.414 0l8-8z" />
          </svg>
          {error}
        </p>
      )}

      {helper && !error && (
        <p className="text-xs text-gray-500 mt-2">{helper}</p>
      )}
    </div>
  )
}
