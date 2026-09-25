/**
 * "Hoy" de negocio en hora de la Ciudad de México, como `YYYY-MM-DD`.
 * Contraparte en TS de `hoy_cdmx()` en SQL (docs/PLAN.md §7.0, regla 4):
 * nunca se usa la fecha UTC del servidor para fechas de negocio.
 */
export function hoyCdmx(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
