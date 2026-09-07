import { Wordmark } from '@/components/ui/Wordmark'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-app">
      <header className="flex items-center justify-center border-b border-hairline px-4 py-4">
        <Wordmark size={22} />
      </header>
      <main className="px-4 py-10">{children}</main>
    </div>
  )
}
