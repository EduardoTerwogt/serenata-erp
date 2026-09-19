import { describe, expect, it } from 'vitest'
import {
  parseFacturaXML,
  validarMontoFactura,
  validarFacturaClienteXML,
  calcularDeadline,
} from '@/lib/server/xml/factura-parser'

const CFDI_BASICO = `
  <cfdi:Comprobante Folio="A123" Fecha="2026-04-09T10:00:00" SubTotal="1000.00" Total="1160.00">
    <cfdi:Emisor Rfc="SER010101AAA" Nombre="Serenata House" />
    <cfdi:Receptor Rfc="XAXX010101000" Nombre="Cliente de prueba" />
    <cfdi:Complemento>
      <tfd:TimbreFiscalDigital UUID="11111111-2222-3333-4444-555555555555" />
    </cfdi:Complemento>
  </cfdi:Comprobante>
`

const CFDI_PERSONA_MORAL = `
  <cfdi:Comprobante Folio="M1" Fecha="2026-04-09T10:00:00" SubTotal="1000.00" Total="1160.00">
    <cfdi:Emisor Rfc="MOR010101AAA" Nombre="Proveedor Moral SA de CV" />
    <cfdi:Receptor Rfc="SER010101AAA" Nombre="Serenata House" />
    <cfdi:Impuestos TotalImpuestosTrasladados="160.00">
      <cfdi:Traslados>
        <cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00" />
      </cfdi:Traslados>
    </cfdi:Impuestos>
  </cfdi:Comprobante>
`

const CFDI_PERSONA_FISICA = `
  <cfdi:Comprobante Folio="F1" Fecha="2026-04-09T10:00:00" SubTotal="1000.00" Total="1053.33">
    <cfdi:Emisor Rfc="FIS010101AAA" Nombre="Proveedor Persona Física" />
    <cfdi:Receptor Rfc="SER010101AAA" Nombre="Serenata House" />
    <cfdi:Impuestos TotalImpuestosTrasladados="160.00" TotalImpuestosRetenidos="106.67">
      <cfdi:Retenciones>
        <cfdi:Retencion Impuesto="002" Importe="106.67" />
        <cfdi:Retencion Impuesto="001" Importe="100.00" />
      </cfdi:Retenciones>
      <cfdi:Traslados>
        <cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00" />
      </cfdi:Traslados>
    </cfdi:Impuestos>
  </cfdi:Comprobante>
`

// CFDI real (folio 369, reportado 2026-09-19): trae cfdi:Impuestos DOS
// veces -- una por cada cfdi:Concepto (desglose del renglón) y otra a
// nivel cfdi:Comprobante (resumen agregado, después de cerrar
// cfdi:Conceptos). Reproduce la estructura exacta que causó el bug real:
// sumar Traslado/Retencion sobre el XML completo los contaba dos veces.
const CFDI_CON_IMPUESTOS_POR_CONCEPTO_Y_DOCUMENTO = `
  <cfdi:Comprobante Folio="369" Fecha="2026-09-01T12:59:00" SubTotal="20000.00" Total="23200.00">
    <cfdi:Emisor Rfc="ALE211125DC7" Nombre="Agata Leasing" />
    <cfdi:Receptor Rfc="SHE241008TX5" Nombre="Serenata House" />
    <cfdi:Conceptos>
      <cfdi:Concepto Importe="20000.00">
        <cfdi:Impuestos>
          <cfdi:Traslados>
            <cfdi:Traslado Base="20000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="3200.00" />
          </cfdi:Traslados>
        </cfdi:Impuestos>
      </cfdi:Concepto>
    </cfdi:Conceptos>
    <cfdi:Impuestos TotalImpuestosTrasladados="3200.00">
      <cfdi:Traslados>
        <cfdi:Traslado Base="20000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="3200.00" />
      </cfdi:Traslados>
    </cfdi:Impuestos>
    <cfdi:Complemento>
      <tfd:TimbreFiscalDigital UUID="2af333b5-6446-428c-947f-1030a56fe82e" />
    </cfdi:Complemento>
  </cfdi:Comprobante>
`

// Mismo caso pero persona física con 2 conceptos -- confirma que ni el
// número de renglones ni las retenciones (también duplicadas por
// concepto) rompen la suma a nivel documento.
const CFDI_FISICA_MULTI_CONCEPTO = `
  <cfdi:Comprobante Folio="F2" Fecha="2026-09-01T12:59:00" SubTotal="1000.00" Total="1053.33">
    <cfdi:Emisor Rfc="FIS010101AAA" Nombre="Proveedor Persona Física" />
    <cfdi:Receptor Rfc="SER010101AAA" Nombre="Serenata House" />
    <cfdi:Conceptos>
      <cfdi:Concepto Importe="600.00">
        <cfdi:Impuestos>
          <cfdi:Retenciones>
            <cfdi:Retencion Impuesto="002" Importe="64.00" />
            <cfdi:Retencion Impuesto="001" Importe="60.00" />
          </cfdi:Retenciones>
          <cfdi:Traslados>
            <cfdi:Traslado Base="600.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="96.00" />
          </cfdi:Traslados>
        </cfdi:Impuestos>
      </cfdi:Concepto>
      <cfdi:Concepto Importe="400.00">
        <cfdi:Impuestos>
          <cfdi:Retenciones>
            <cfdi:Retencion Impuesto="002" Importe="42.67" />
            <cfdi:Retencion Impuesto="001" Importe="40.00" />
          </cfdi:Retenciones>
          <cfdi:Traslados>
            <cfdi:Traslado Base="400.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="64.00" />
          </cfdi:Traslados>
        </cfdi:Impuestos>
      </cfdi:Concepto>
    </cfdi:Conceptos>
    <cfdi:Impuestos TotalImpuestosTrasladados="160.00" TotalImpuestosRetenidos="106.67">
      <cfdi:Retenciones>
        <cfdi:Retencion Impuesto="002" Importe="106.67" />
        <cfdi:Retencion Impuesto="001" Importe="100.00" />
      </cfdi:Retenciones>
      <cfdi:Traslados>
        <cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00" />
      </cfdi:Traslados>
    </cfdi:Impuestos>
  </cfdi:Comprobante>
`

// Namespace inventado (no "cfdi") -- confirma que la extracción no depende
// del prefijo literal, solo del nombre del elemento sin prefijo.
const CFDI_OTRO_NAMESPACE = `
  <fact:Comprobante Folio="X1" Fecha="2026-05-01T09:00:00" SubTotal="500.00" Total="580.00">
    <fact:Emisor Rfc="OTR010101AAA" />
    <fact:Impuestos>
      <fact:Traslados>
        <fact:Traslado Impuesto="002" Importe="80.00" />
      </fact:Traslados>
    </fact:Impuestos>
  </fact:Comprobante>
`

// Un complemento (cualquiera, aquí un namespace ficticio "otro") trae por
// coincidencia un elemento llamado Traslado -- con el parser real esto
// nunca se suma porque solo se lee comprobante.Impuestos, nunca
// comprobante.Complemento. Con el enfoque de regex anterior (aunque ya
// scopeado a "después de Conceptos") este caso SÍ se habría sumado por
// error, porque Complemento también cae después de Conceptos.
const CFDI_COMPLEMENTO_CON_TAG_COLISIONANTE = `
  <cfdi:Comprobante Folio="X2" Fecha="2026-05-01T09:00:00" SubTotal="500.00" Total="580.00">
    <cfdi:Conceptos>
      <cfdi:Concepto Importe="500.00" />
    </cfdi:Conceptos>
    <cfdi:Impuestos>
      <cfdi:Traslados>
        <cfdi:Traslado Impuesto="002" Importe="80.00" />
      </cfdi:Traslados>
    </cfdi:Impuestos>
    <cfdi:Complemento>
      <otro:AlgunComplemento>
        <otro:Traslado Impuesto="002" Importe="9999.00" />
      </otro:AlgunComplemento>
    </cfdi:Complemento>
  </cfdi:Comprobante>
`

// Documento con dos tasas de IVA distintas (ej. 16% y 0%) en el resumen a
// nivel documento -- confirma que sumImporteByImpuesto suma TODAS las
// líneas del mismo código de impuesto, no solo la primera.
const CFDI_DOS_TASAS_IVA = `
  <cfdi:Comprobante Folio="X3" Fecha="2026-05-01T09:00:00" SubTotal="1000.00" Total="1080.00">
    <cfdi:Impuestos>
      <cfdi:Traslados>
        <cfdi:Traslado Impuesto="002" TasaOCuota="0.160000" Importe="80.00" />
        <cfdi:Traslado Impuesto="002" TasaOCuota="0.000000" Importe="0.00" />
      </cfdi:Traslados>
    </cfdi:Impuestos>
  </cfdi:Comprobante>
`

describe('xml/factura-parser', () => {
  it('parsea folio, fecha, monto, RFCs y UUID de un CFDI básico', () => {
    const result = parseFacturaXML(CFDI_BASICO)
    expect(result.error).toBeUndefined()
    expect(result.folio).toBe('A123')
    expect(result.fecha_emision).toBe('2026-04-09')
    expect(result.monto_total).toBe(1160)
    expect(result.rfc_emisor).toBe('SER010101AAA')
    expect(result.rfc_receptor).toBe('XAXX010101000')
    expect(result.uuid_timbrado).toBe('11111111-2222-3333-4444-555555555555')
  })

  it('no confunde SubTotal con Total', () => {
    const result = parseFacturaXML(CFDI_BASICO)
    expect(result.monto_total).not.toBe(1000)
  })

  it('reporta error si faltan folio o fecha', () => {
    const result = parseFacturaXML('<cfdi:Comprobante Total="100.00" />')
    expect(result.error).toBeTruthy()
  })

  describe('validarMontoFactura (informativa, ya existente)', () => {
    it('detecta coincidencia dentro de tolerancia', () => {
      expect(validarMontoFactura(1000, 1000.005).coincide).toBe(true)
    })
    it('detecta discrepancia', () => {
      expect(validarMontoFactura(1000, 900).coincide).toBe(false)
    })
  })

  describe('validarFacturaClienteXML', () => {
    it('valida cuando el monto coincide con la cuenta', () => {
      const result = validarFacturaClienteXML({ monto_total: 1160 }, 1160)
      expect(result.estado_validacion).toBe('validado')
      expect(result.detalle_validacion).toBeNull()
    })

    it('tolera diferencias de centavos por redondeo', () => {
      const result = validarFacturaClienteXML({ monto_total: 1160.004 }, 1160)
      expect(result.estado_validacion).toBe('validado')
    })

    it('marca revision cuando el monto no coincide', () => {
      const result = validarFacturaClienteXML({ monto_total: 900 }, 1160)
      expect(result.estado_validacion).toBe('revision')
      expect(result.detalle_validacion).toContain('900.00')
      expect(result.detalle_validacion).toContain('1160.00')
    })

    it('marca revision si no se pudo leer el monto', () => {
      const result = validarFacturaClienteXML({}, 1160)
      expect(result.estado_validacion).toBe('revision')
    })
  })

  describe('parseFacturaXML - desglose fiscal (traslados/retenciones)', () => {
    it('extrae subtotal e IVA trasladado de un CFDI de persona moral (sin retenciones)', () => {
      const result = parseFacturaXML(CFDI_PERSONA_MORAL)
      expect(result.subtotal).toBe(1000)
      expect(result.iva_trasladado).toBe(160)
      expect(result.iva_retenido).toBe(0)
      expect(result.isr_retenido).toBe(0)
    })

    it('extrae IVA trasladado y ambas retenciones de un CFDI de persona física', () => {
      const result = parseFacturaXML(CFDI_PERSONA_FISICA)
      expect(result.subtotal).toBe(1000)
      expect(result.iva_trasladado).toBe(160)
      expect(result.iva_retenido).toBe(106.67)
      expect(result.isr_retenido).toBe(100)
    })

    it('BUG REAL (folio 369, 2026-09-19): no duplica el IVA trasladado cuando el CFDI trae cfdi:Impuestos por Concepto ADEMÁS del resumen a nivel documento', () => {
      const result = parseFacturaXML(CFDI_CON_IMPUESTOS_POR_CONCEPTO_Y_DOCUMENTO)
      expect(result.subtotal).toBe(20000)
      expect(result.monto_total).toBe(23200)
      // Antes del fix daba 6400 (3200 del Concepto + 3200 del documento).
      expect(result.iva_trasladado).toBe(3200)
    })

    it('no duplica retenciones con múltiples Conceptos, cada uno con su propio desglose', () => {
      const result = parseFacturaXML(CFDI_FISICA_MULTI_CONCEPTO)
      expect(result.subtotal).toBe(1000)
      expect(result.iva_trasladado).toBe(160)
      expect(result.iva_retenido).toBe(106.67)
      expect(result.isr_retenido).toBe(100)
    })

    it('funciona igual con cualquier prefijo de namespace, no solo "cfdi"', () => {
      const result = parseFacturaXML(CFDI_OTRO_NAMESPACE)
      expect(result.error).toBeUndefined()
      expect(result.folio).toBe('X1')
      expect(result.rfc_emisor).toBe('OTR010101AAA')
      expect(result.iva_trasladado).toBe(80)
    })

    it('ignora un tag llamado Traslado dentro de Complemento (otro namespace/complemento)', () => {
      const result = parseFacturaXML(CFDI_COMPLEMENTO_CON_TAG_COLISIONANTE)
      // Si esto diera 8079 (80 + 9999... no, 9999) el bug habría regresado
      // por otra vía: sumar cualquier "Traslado" en Complemento.
      expect(result.iva_trasladado).toBe(80)
    })

    it('suma todas las líneas de Traslado con el mismo código de impuesto (varias tasas)', () => {
      const result = parseFacturaXML(CFDI_DOS_TASAS_IVA)
      expect(result.iva_trasladado).toBe(80)
    })

    it('reporta error explícito si el XML está mal formado (tag sin cerrar)', () => {
      const result = parseFacturaXML('<cfdi:Comprobante Folio="X" Fecha="2026-01-01"><cfdi:Emisor Rfc="A" />')
      expect(result.error).toBeTruthy()
    })
  })

  describe('calcularDeadline (ya existente)', () => {
    it('suma 30 días', () => {
      expect(calcularDeadline('2026-01-01')).toBe('2026-01-31')
    })
  })
})
