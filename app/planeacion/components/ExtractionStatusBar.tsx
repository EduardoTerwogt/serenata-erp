'use client'

import { Icon } from '@/components/ui/Icon'

interface ExtractionStatusBarProps {
  method?: 'ai' | 'regex'
  tokensUsed?: number
  tokensAvailable?: number
}

export default function ExtractionStatusBar({
  method = 'regex',
  tokensUsed = 0,
  tokensAvailable = 5000,
}: ExtractionStatusBarProps) {
  const percentageUsed = tokensAvailable > 0 ? Math.round((tokensUsed / tokensAvailable) * 100) : 0
  const isAI = method === 'ai'

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-control text-sm ${
      isAI ? 'bg-approved-bg border border-approved-fg/30 text-approved-fg' : 'bg-issued-bg border border-issued-fg/30 text-issued-fg'
    }`}>
      <div className="flex items-center gap-2">
        <Icon name={isAI ? 'check' : 'warning'} size={16} />
        <span className="font-medium">
          {isAI ? 'Usando Claude AI' : 'Parser local (fallback)'}
        </span>
      </div>

      {isAI && tokensAvailable > 0 && (
        <>
          <div className="flex-1 flex items-center gap-2 text-xs">
            <div className="flex-1 rounded-pill bg-row h-2 overflow-hidden">
              <div
                className="bg-approved-fg h-full transition-all"
                style={{ width: `${percentageUsed}%` }}
              />
            </div>
            <span className="whitespace-nowrap">{percentageUsed}% usado</span>
            <span className="whitespace-nowrap text-faint">
              ({tokensUsed}/{tokensAvailable})
            </span>
          </div>
          {percentageUsed >= 80 && (
            <a
              href="/ajustes"
              className="ml-2 rounded-control bg-accent-quiet/30 hover:bg-accent-quiet/50 px-2 py-1 text-accent text-xs font-medium transition-colors"
            >
              Recargar tokens →
            </a>
          )}
        </>
      )}
    </div>
  )
}
