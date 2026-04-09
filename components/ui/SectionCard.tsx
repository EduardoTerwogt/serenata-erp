import { ReactNode } from 'react'

interface SectionCardProps {
  title?: string
  description?: string
  children: ReactNode
  className?: string
  headerClassName?: string
  contentClassName?: string
  borderedHeader?: boolean
  actions?: ReactNode
}

export function SectionCard({
  title,
  description,
  children,
  className = '',
  headerClassName = '',
  contentClassName = '',
  borderedHeader = false,
  actions,
}: SectionCardProps) {
  return (
    <div className={`bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-xl transition-all duration-300 hover:border-gray-700/50 ${className}`.trim()}>
      {(title || description || actions) && (
        <div className={`${borderedHeader ? 'border-b border-gray-800/30 ' : ''}p-4 md:p-6 ${headerClassName}`.trim()}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              {title && <h2 className="text-lg font-semibold font-display text-white">{title}</h2>}
              {description && <p className="text-gray-500 text-sm mt-1">{description}</p>}
            </div>
            {actions && <div className="flex-shrink-0">{actions}</div>}
          </div>
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </div>
  )
}
