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
    <div className={`bg-gray-900 border border-gray-800 rounded-xl ${className}`.trim()}>
      {(title || description || actions) && (
        <div className={`${borderedHeader ? 'border-b border-gray-800 ' : ''}p-4 md:p-6 ${headerClassName}`.trim()}>
          <div className="flex items-center justify-between gap-3">
            <div>
              {title && <h2 className="text-lg font-semibold text-white">{title}</h2>}
              {description && <p className="text-gray-500 text-sm mt-1">{description}</p>}
            </div>
            {actions}
          </div>
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </div>
  )
}
