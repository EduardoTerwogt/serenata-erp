import { Suspense } from 'react'
import { SectionLoading } from '@/components/ui/SectionLoading'
import { CuentasApp } from './components/CuentasApp'

export default function Page() {
  return (
    <Suspense fallback={<SectionLoading />}>
      <CuentasApp />
    </Suspense>
  )
}
