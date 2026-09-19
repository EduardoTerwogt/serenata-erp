import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { Cliente } from '@/lib/types'

export async function getClientes() {
  const { data, error } = await supabaseAdmin
    .from('clientes')
    .select('*')
    .order('nombre')
  if (error) throw error
  return (data || []) as Cliente[]
}

export async function getClienteById(id: string) {
  const { data, error } = await supabaseAdmin
    .from('clientes')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Cliente
}

export async function updateCliente(id: string, updates: Partial<Cliente>) {
  const { data, error } = await supabaseAdmin
    .from('clientes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Cliente
}
