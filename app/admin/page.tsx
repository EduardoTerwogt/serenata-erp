'use client'

import { useState } from 'react'
import { FilterTabs, type FilterTab } from '@/components/ui/FilterTabs'
import { AdminUsuarios } from './components/AdminUsuarios'
import { AdminSheets } from './components/AdminSheets'

type AdminTab = 'usuarios' | 'sheets'

const TABS: FilterTab<AdminTab>[] = [
  { value: 'usuarios', label: 'Usuarios' },
  { value: 'sheets', label: 'Google Sheets' },
]

// 9 y 10 · Admin (AdminScreen.jsx del kit): una sola entrada de nav con
// Usuarios y Google Sheets como tabs dentro, no dos secciones separadas.
export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('usuarios')

  return (
    <div className="flex flex-col gap-[19px]">
      <div className="sn-display text-h2 text-ink">Admin</div>
      <FilterTabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'usuarios' ? <AdminUsuarios /> : <AdminSheets />}
    </div>
  )
}
