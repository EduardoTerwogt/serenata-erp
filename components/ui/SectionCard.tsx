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
    <div className={`bg-card border border-hairline rounded-panel ${className}`.trim()}>
      {(title || description || actions) && (
        <div className={`${borderedHeader ? 'border-b border-hairline ' : ''}p-4 md:p-6 ${headerClassName}`.trim()}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              {title && <h2 className="text-h3 font-semibold text-ink">{title}</h2>}
              {description && <p className="text-subtext text-content mt-1">{description}</p>}
            </div>
            {actions && <div className="flex-shrink-0">{actions}</div>}
          </div>
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </div>
  )
}
