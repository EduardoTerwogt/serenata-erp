/**
 * B7 (docs/PLAN.md, F9): contrato de `auditar_consistencia()`. Una guarda por
 * invariante del modelo; `violaciones` es cuántas filas la rompen y `ejemplos`
 * trae hasta 5 ids para ir a revisarlas.
 */
export interface GuardaAuditoria {
  clave: string
  descripcion: string
  violaciones: number
  ejemplos: string[]
}

export interface ResultadoAuditoria {
  /** ISO 8601 en UTC. */
  ejecutado_en: string
  total_violaciones: number
  guardas: GuardaAuditoria[]
}
