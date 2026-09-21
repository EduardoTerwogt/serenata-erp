import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  getByTipoMock: vi.fn(),
  saveDraftMock: vi.fn(),
  discardDraftMock: vi.fn(),
  aplicarMock: vi.fn(),
  restaurarMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireSection: mocks.requireSectionMock,
}))

vi.mock('@/lib/server/repositories/pdf-plantillas', () => ({
  PdfPlantillasRepository: {
    getByTipo: mocks.getByTipoMock,
    saveDraft: mocks.saveDraftMock,
    discardDraft: mocks.discardDraftMock,
    aplicar: mocks.aplicarMock,
    restaurar: mocks.restaurarMock,
  },
}))

import { GET } from '../../../app/api/editor-pdfs/[tipo]/route'
import { PATCH, DELETE } from '../../../app/api/editor-pdfs/[tipo]/draft/route'
import { POST as APLICAR } from '../../../app/api/editor-pdfs/[tipo]/aplicar/route'
import { POST as RESTAURAR } from '../../../app/api/editor-pdfs/[tipo]/restaurar/route'

const VALID_TEMPLATE = {
  tipoDocumento: 'cotizacion' as const,
  page: { width: 210 as const, height: 297 as const, margins: { top: 10, right: 10, bottom: 10, left: 10 } },
  elements: [
    {
      id: 'el-1',
      x: 10,
      y: 10,
      w: 50,
      type: 'text' as const,
      text: 'Cliente: {{cliente}}',
      size: 10,
      bold: false,
      align: 'left' as const,
      colorToken: 'orange',
    },
  ],
}

const AUTH_OK = { session: { user: { id: 'user-1', sections: ['editor-pdfs'] } }, response: null }
const AUTH_DENIED = { session: null, response: Response.json({ error: 'No autorizado' }, { status: 403 }) }

function paramsFor(tipo: string) {
  return { params: Promise.resolve({ tipo }) }
}

describe('API /api/editor-pdfs/[tipo]', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
  })

  describe('GET', () => {
    it('corta si no hay sección editor-pdfs', async () => {
      mocks.requireSectionMock.mockResolvedValue(AUTH_DENIED)
      const res = await GET(new Request('http://localhost'), paramsFor('cotizacion'))
      expect(res.status).toBe(403)
      expect(mocks.getByTipoMock).not.toHaveBeenCalled()
    })

    it('rechaza un tipo de documento inválido', async () => {
      mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
      const res = await GET(new Request('http://localhost'), paramsFor('no-existe'))
      expect(res.status).toBe(400)
    })

    it('devuelve null si el documento no está migrado (sin fila)', async () => {
      mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
      mocks.getByTipoMock.mockResolvedValue(null)
      const res = await GET(new Request('http://localhost'), paramsFor('cotizacion'))
      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toBeNull()
    })

    it('devuelve la fila cuando existe', async () => {
      mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
      mocks.getByTipoMock.mockResolvedValue({ id: 'row-1', tipo_documento: 'cotizacion' })
      const res = await GET(new Request('http://localhost'), paramsFor('cotizacion'))
      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({ id: 'row-1', tipo_documento: 'cotizacion' })
    })
  })

  describe('PATCH draft (autosave)', () => {
    it('valida el schema antes de guardar', async () => {
      mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
      const res = await PATCH(
        new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ elements: [] }) }),
        paramsFor('cotizacion')
      )
      expect(res.status).toBe(400)
      expect(mocks.saveDraftMock).not.toHaveBeenCalled()
    })

    it('rechaza si tipoDocumento del body no coincide con la URL', async () => {
      mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
      const res = await PATCH(
        new Request('http://localhost', { method: 'PATCH', body: JSON.stringify(VALID_TEMPLATE) }),
        paramsFor('orden_pago')
      )
      expect(res.status).toBe(400)
    })

    it('guarda el draft con un schema válido', async () => {
      mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
      mocks.saveDraftMock.mockResolvedValue({ id: 'row-1', draft_schema: VALID_TEMPLATE })
      const res = await PATCH(
        new Request('http://localhost', { method: 'PATCH', body: JSON.stringify(VALID_TEMPLATE) }),
        paramsFor('cotizacion')
      )
      expect(res.status).toBe(200)
      expect(mocks.saveDraftMock).toHaveBeenCalledWith('cotizacion', VALID_TEMPLATE, 'user-1')
    })
  })

  describe('DELETE draft (descartar cambios)', () => {
    it('descarta el draft sin tocar active_schema', async () => {
      mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
      mocks.discardDraftMock.mockResolvedValue({ id: 'row-1', draft_schema: null })
      const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), paramsFor('cotizacion'))
      expect(res.status).toBe(200)
      expect(mocks.discardDraftMock).toHaveBeenCalledWith('cotizacion')
    })
  })

  describe('POST aplicar', () => {
    it('404 si el documento no está migrado', async () => {
      mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
      mocks.getByTipoMock.mockResolvedValue(null)
      const res = await APLICAR(new Request('http://localhost', { method: 'POST' }), paramsFor('cotizacion'))
      expect(res.status).toBe(404)
      expect(mocks.aplicarMock).not.toHaveBeenCalled()
    })

    it('400 si no hay draft_schema pendiente', async () => {
      mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
      mocks.getByTipoMock.mockResolvedValue({ draft_schema: null })
      const res = await APLICAR(new Request('http://localhost', { method: 'POST' }), paramsFor('cotizacion'))
      expect(res.status).toBe(400)
    })

    it('400 si el draft guardado tiene errores estructurales', async () => {
      mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
      mocks.getByTipoMock.mockResolvedValue({ draft_schema: { elements: [] } })
      const res = await APLICAR(new Request('http://localhost', { method: 'POST' }), paramsFor('cotizacion'))
      expect(res.status).toBe(400)
      expect(mocks.aplicarMock).not.toHaveBeenCalled()
    })

    it('aplica el draft válido y promueve a active_schema', async () => {
      mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
      mocks.getByTipoMock.mockResolvedValue({ draft_schema: VALID_TEMPLATE })
      mocks.aplicarMock.mockResolvedValue({ id: 'row-1', active_schema: VALID_TEMPLATE, draft_schema: null })
      const res = await APLICAR(new Request('http://localhost', { method: 'POST' }), paramsFor('cotizacion'))
      expect(res.status).toBe(200)
      expect(mocks.aplicarMock).toHaveBeenCalledWith('cotizacion', VALID_TEMPLATE, 'user-1')
    })
  })

  describe('POST restaurar', () => {
    it('501 mientras no exista baseline (Bloques 7-9 pendientes)', async () => {
      mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
      mocks.restaurarMock.mockRejectedValue(new Error('todavía no tiene una plantilla baseline'))
      const res = await RESTAURAR(new Request('http://localhost', { method: 'POST' }), paramsFor('cotizacion'))
      expect(res.status).toBe(501)
    })

    it('restaura cuando el repositorio resuelve', async () => {
      mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
      mocks.restaurarMock.mockResolvedValue({ id: 'row-1', active_schema: VALID_TEMPLATE })
      const res = await RESTAURAR(new Request('http://localhost', { method: 'POST' }), paramsFor('cotizacion'))
      expect(res.status).toBe(200)
      expect(mocks.restaurarMock).toHaveBeenCalledWith('cotizacion', 'user-1')
    })
  })
})
