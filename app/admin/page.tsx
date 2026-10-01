'use client'

import { AdminUsuarios } from './components/AdminUsuarios'

// 9 · Admin (AdminScreen.jsx del kit): hoy solo Usuarios. Google Sheets se
// retiró (PLAN.md, D2): Postgres es la única fuente de verdad, sin espejo.
export default function AdminPage() {
  return (
    <div className="flex flex-col gap-[19px]">
      <div className="sn-display text-h2 text-ink">Admin</div>
      <AdminUsuarios />
    </div>
  )
}
