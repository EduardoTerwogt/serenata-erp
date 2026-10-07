/**
 * #123 (B3): las rutas nuevas de Cuentas reciben un multipart con los archivos y un campo `datos` con el resto en
 * JSON (así Zod valida un solo objeto, con arreglos, en vez de campos sueltos de texto).
 */
export function leerDatosMultipart(formData: FormData, campo = 'datos'): { ok: true; data: unknown } | { ok: false; error: string } {
  const crudo = formData.get(campo)
  if (typeof crudo !== 'string' || crudo.trim() === '') return { ok: false, error: `Falta el campo ${campo}` }
  try {
    return { ok: true, data: JSON.parse(crudo) }
  } catch {
    return { ok: false, error: `El campo ${campo} no es JSON válido` }
  }
}
