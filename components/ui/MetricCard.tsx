import { ReactNode } from 'react'
import { AppCard } from '@/components/ui/AppCard'

interface MetricCardProps {
  label: string
  value: ReactNode
  valueClassName?: string
  className?: string
}

export function MetricCard({ label, value, valueClassName = '', className = 'p-5' }: MetricCardProps) {
  return (
    <AppCard className={className}>
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <div className={`text-2xl font-bold ${valueClassName}`.trim()}>{value}</div>
    </AppCard>
  )
}
