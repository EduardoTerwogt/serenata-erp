/**
 * Generador de HTML para órdenes de pago
 * Renderiza con Puppeteer a PDF
 */

export interface ItemOrden {
  responsable: {
    id: string
    nombre: string
    correo: string | null
    telefono: string | null
    banco: string | null
    clabe: string | null
  }
  eventos: {
    cotizacion_folio: string
    proyecto: string
    items: {
      descripcion: string
      cantidad: number
      monto: number
    }[]
    subtotal: number
  }[]
  total_responsable: number
}

export function generateOrdenPagoHTML(orden: ItemOrden[], totalGeneral: number): string {
  const fechaActual = new Date().toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const responsablesHTML = orden
    .map(
      (resp) => `
    <div style="page-break-inside: avoid; margin-bottom: 40px;">
      <h2 style="color: #1a1a1a; font-size: 16px; margin: 0 0 15px 0; border-bottom: 2px solid #ff8000; padding-bottom: 8px;">
        ${resp.responsable.nombre}
      </h2>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; font-size: 13px;">
        ${resp.responsable.correo ? `<div><strong>Correo:</strong> ${resp.responsable.correo}</div>` : ''}
        ${resp.responsable.telefono ? `<div><strong>Teléfono:</strong> ${resp.responsable.telefono}</div>` : ''}
        ${resp.responsable.banco ? `<div><strong>Banco:</strong> ${resp.responsable.banco}</div>` : ''}
        ${resp.responsable.clabe ? `<div><strong>CLABE:</strong> ${resp.responsable.clabe}</div>` : ''}
      </div>

      ${resp.eventos
        .map(
          (evt) => `
        <div style="margin-bottom: 20px;">
          <div style="background: #f5f5f5; padding: 10px; margin-bottom: 10px; font-weight: bold; font-size: 13px;">
            ${evt.proyecto} (${evt.cotizacion_folio})
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 10px;">
            <thead>
              <tr style="background: #e8e8e8; border: 1px solid #ddd;">
                <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Cargo/Descripción</th>
                <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Cantidad</th>
                <th style="padding: 8px; text-align: right; border: 1px solid #ddd;">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${evt.items
                .map(
                  (item) => `
                <tr style="border: 1px solid #ddd;">
                  <td style="padding: 8px; border: 1px solid #ddd;">${item.descripcion}</td>
                  <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">${item.cantidad}</td>
                  <td style="padding: 8px; text-align: right; border: 1px solid #ddd;">$${item.monto.toFixed(2)}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>

          <div style="text-align: right; padding: 8px; background: #f0f0f0; border: 1px solid #ddd; font-weight: bold;">
            TOTAL EVENTO: $${evt.subtotal.toFixed(2)}
          </div>
        </div>
      `
        )
        .join('')}

      <div style="text-align: right; padding: 12px; background: #fff3e0; border: 2px solid #ff8000; font-weight: bold; font-size: 14px; margin-top: 15px;">
        TOTAL ${resp.responsable.nombre.toUpperCase()}: $${resp.total_responsable.toFixed(2)}
      </div>
    </div>
  `
    )
    .join('')

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Orden de Pago</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: Arial, sans-serif;
          background: #fff;
          color: #333;
          line-height: 1.6;
          padding: 40px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
          border-bottom: 3px solid #ff8000;
          padding-bottom: 20px;
        }
        .logo {
          font-size: 28px;
          font-weight: bold;
          color: #ff8000;
        }
        .title {
          font-size: 24px;
          font-weight: bold;
          color: #1a1a1a;
        }
        .fecha {
          font-size: 12px;
          color: #666;
        }
        .content {
          margin-bottom: 40px;
        }
        .footer {
          text-align: right;
          margin-top: 40px;
          padding-top: 20px;
          border-top: 2px solid #ff8000;
        }
        .total-general {
          text-align: right;
          font-size: 18px;
          font-weight: bold;
          color: #fff;
          background: #ff8000;
          padding: 15px 20px;
          border-radius: 5px;
          display: inline-block;
        }
        @media print {
          body {
            padding: 20px;
          }
          .content {
            page-break-inside: avoid;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title">ORDEN DE PAGO</div>
          <div class="fecha">Generado: ${fechaActual}</div>
        </div>
        <div class="logo">Serenata</div>
      </div>

      <div class="content">
        ${responsablesHTML}
      </div>

      <div class="footer">
        <div class="total-general">
          TOTAL GENERAL: $${totalGeneral.toFixed(2)}
        </div>
      </div>
    </body>
    </html>
  `
}
