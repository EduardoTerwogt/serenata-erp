interface StatusBannerProps {
  tone: 'error' | 'success' | 'info'
  children: React.ReactNode
  className?: string
}

const TONE_CLASS: Record<StatusBannerProps['tone'], string> = {
  error: 'bg-red-900/40 border-red-700 text-red-300',
  success: 'bg-green-900/40 border-green-700 text-green-300',
  info: 'bg-blue-900/40 border-blue-700 text-blue-300',
}

export function StatusBanner({ tone, children, className = '' }: StatusBannerProps) {
  return (
    <div className={`${TONE_CLASS[tone]} border rounded-lg px-4 py-3 ${className}`.trim()}>
      {children}
    </div>
  )
}
