import { ReactNode } from 'react'

interface AppCardProps {
  children: ReactNode
  className?: string
}

export function AppCard({ children, className = '' }: AppCardProps) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl ${className}`.trim()}>
      {children}
    </div>
  )
}
