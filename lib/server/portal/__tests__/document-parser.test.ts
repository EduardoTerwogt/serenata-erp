import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createMock: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mocks.createMock },
  })),
}))

import { extraerDatosIdentidad } from '../document-parser'

function textResponse(text: string) {
  return { content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 } }
}

describe('extraerDatosIdentidad', () => {
  beforeEach(() => {
    mocks.createMock.mockReset()
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })

  it('retorna nulls sin llamar a Claude si no hay API key configurada', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const file = new File(['contenido'], 'ine.jpg', { type: 'image/jpeg' })

    const result = await extraerDatosIdentidad(file)

    expect(result).toEqual({ nombre_completo: null, regimen_fiscal: null })
    expect(mocks.createMock).not.toHaveBeenCalled()
  })

  it('retorna nulls sin llamar a Claude si el tipo de archivo no es soportado', async () => {
    const file = new File(['contenido'], 'documento.txt', { type: 'text/plain' })

    const result = await extraerDatosIdentidad(file)

    expect(result).toEqual({ nombre_completo: null, regimen_fiscal: null })
    expect(mocks.createMock).not.toHaveBeenCalled()
  })

  it('extrae nombre y régimen fiscal de una respuesta válida (imagen)', async () => {
    mocks.createMock.mockResolvedValue(
      textResponse('{"nombre_completo": "Jose Antonio Gutierrez Hernandez", "regimen_fiscal": "fisica"}')
    )
    const file = new File(['contenido'], 'ine.jpg', { type: 'image/jpeg' })

    const result = await extraerDatosIdentidad(file)

    expect(result).toEqual({ nombre_completo: 'Jose Antonio Gutierrez Hernandez', regimen_fiscal: 'fisica' })
    const callArgs = mocks.createMock.mock.calls[0][0]
    expect(callArgs.messages[0].content[0].type).toBe('image')
  })

  it('envía el documento como bloque "document" cuando es PDF', async () => {
    mocks.createMock.mockResolvedValue(textResponse('{"nombre_completo": "Renta de Equipo MX", "regimen_fiscal": "moral"}'))
    const file = new File(['contenido'], 'constancia.pdf', { type: 'application/pdf' })

    await extraerDatosIdentidad(file)

    const callArgs = mocks.createMock.mock.calls[0][0]
    expect(callArgs.messages[0].content[0].type).toBe('document')
  })

  it('retorna nulls si la respuesta no es JSON válido', async () => {
    mocks.createMock.mockResolvedValue(textResponse('no puedo leer este documento'))
    const file = new File(['contenido'], 'ine.jpg', { type: 'image/jpeg' })

    const result = await extraerDatosIdentidad(file)

    expect(result).toEqual({ nombre_completo: null, regimen_fiscal: null })
  })

  it('retorna nulls si la respuesta no pasa la validación Zod', async () => {
    mocks.createMock.mockResolvedValue(textResponse('{"nombre_completo": 123, "regimen_fiscal": "otra_cosa"}'))
    const file = new File(['contenido'], 'ine.jpg', { type: 'image/jpeg' })

    const result = await extraerDatosIdentidad(file)

    expect(result).toEqual({ nombre_completo: null, regimen_fiscal: null })
  })

  it('retorna nulls sin tronar si Claude falla (timeout/red)', async () => {
    mocks.createMock.mockRejectedValue(new Error('network error'))
    const file = new File(['contenido'], 'ine.jpg', { type: 'image/jpeg' })

    const result = await extraerDatosIdentidad(file)

    expect(result).toEqual({ nombre_completo: null, regimen_fiscal: null })
  })
})
