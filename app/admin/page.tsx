'use client'

import { AdminUsuarios } from './components/AdminUsuarios'
import { AdminAuditoria } from './components/AdminAuditoria'
import { AdminDatosFiscales } from './components/AdminDatosFiscales'

// 9 · Admin (AdminScreen.jsx del kit): Usuarios, datos fiscales de Serenata (#123 B6a) y consistencia de datos (B7). Google Sheets se
// retiró (PLAN.md, D2): Postgres es la única fuente de verdad, sin espejo.
export default function AdminPage() {
  return (
    <div className="flex flex-col gap-[19px]">
      <div className="sn-display text-h2 text-ink">Admin</div>
      <AdminUsuarios />
      <AdminDatosFiscales />
      <AdminAuditoria />
    </div>
  )
}
