'use client'

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
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm ${
      isAI
        ? 'bg-green-900/20 border border-green-800 text-green-300'
        : 'bg-yellow-900/20 border border-yellow-800 text-yellow-300'
    }`}>
      {/* Status Indicator */}
      <div className="flex items-center gap-2">
        <span className="text-lg">{isAI ? '✓' : '⚠️'}</span>
        <span className="font-medium">
          {isAI ? 'Usando Claude AI' : 'Parser local (fallback)'}
        </span>
      </div>

      {/* Token Usage */}
      {isAI && tokensAvailable > 0 && (
        <>
          <div className="flex-1 flex items-center gap-2 text-xs">
            <div className="flex-1 bg-gray-800/50 rounded h-2 overflow-hidden">
              <div
                className="bg-green-500 h-full transition-all"
                style={{ width: `${percentageUsed}%` }}
              />
            </div>
            <span className="whitespace-nowrap">{percentageUsed}% usado</span>
            <span className="whitespace-nowrap text-gray-400">
              ({tokensUsed}/{tokensAvailable})
            </span>
          </div>
          {percentageUsed >= 80 && (
            <a
              href="/ajustes"
              className="ml-2 px-2 py-1 bg-orange-600/30 hover:bg-orange-600/50 rounded text-orange-300 text-xs font-medium transition-colors"
            >
              Recargar tokens →
            </a>
          )}
        </>
      )}
    </div>
  )
}
