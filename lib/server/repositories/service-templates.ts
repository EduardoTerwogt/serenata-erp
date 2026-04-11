import { supabaseAdmin } from '@/lib/supabase'
import type { ServiceTemplate, ServiceTemplateItem } from '@/lib/types'

export const ServiceTemplateRepository = {
  async getAll(): Promise<ServiceTemplate[]> {
    const { data, error } = await supabaseAdmin
      .from('service_templates')
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true })

    if (error) {
      console.error('Error fetching service templates:', error)
      throw new Error('Failed to fetch service templates')
    }

    return data || []
  },

  async getById(id: string): Promise<ServiceTemplate | null> {
    const { data, error } = await supabaseAdmin
      .from('service_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      console.error('Error fetching service template:', error)
      throw new Error('Failed to fetch service template')
    }

    return data
  },

  async create(
    nombre: string,
    descripcion: string | null,
    items: ServiceTemplateItem[]
  ): Promise<ServiceTemplate> {
    const { data, error } = await supabaseAdmin
      .from('service_templates')
      .insert([
        {
          nombre,
          descripcion,
          items,
          activo: true,
        },
      ])
      .select()
      .single()

    if (error) {
      console.error('Error creating service template:', error)
      throw new Error('Failed to create service template')
    }

    return data
  },

  async update(
    id: string,
    nombre: string,
    descripcion: string | null,
    items: ServiceTemplateItem[]
  ): Promise<ServiceTemplate> {
    const { data, error } = await supabaseAdmin
      .from('service_templates')
      .update({
        nombre,
        descripcion,
        items,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating service template:', error)
      throw new Error('Failed to update service template')
    }

    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('service_templates')
      .update({ activo: false })
      .eq('id', id)

    if (error) {
      console.error('Error deleting service template:', error)
      throw new Error('Failed to delete service template')
    }
  },

  async duplicate(id: string, nuevoNombre: string): Promise<ServiceTemplate> {
    const template = await this.getById(id)
    if (!template) {
      throw new Error('Template not found')
    }

    return this.create(nuevoNombre, template.descripcion, template.items)
  },
}
