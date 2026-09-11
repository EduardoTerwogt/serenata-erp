# Roadmap

**Última actualización:** 2026-09-11

Dirección general del producto. Responde **¿hacia dónde vamos?** — no es el prompt de
una sesión de trabajo. Para lo que se está construyendo ahora,
`docs/ACTIVE_WORK.md`.

Solo hay dos iniciativas comprometidas. **Lo que sigue después es producto y se
define en Chat una vez cerradas ambas** — deliberadamente, para no priorizar features
con información vieja.

---

## Ahora — Fase 8.7, Cierre real de Collaboration

Cerrar los huecos de la auditoría de Fase 8 y dejar Cotizaciones oficialmente READY.
Detalle y bloques en `docs/ACTIVE_WORK.md`.

## Siguiente — Engineering Hardening

Hallazgos de la auditoría de ingeniería (2026-09). Ninguno obliga a reescribir el
sistema; todos son corregibles incrementalmente. Van **antes** que cualquier feature
nueva, porque son patrones transversales: cada módulo que se agregue encima los
replica.

### Frentes

| Frente | Qué resuelve | P |
|---|---|---|
| **A. Escalabilidad del acceso a datos** | El patrón "traer toda la tabla y filtrar en JS". Incluye un bug latente: `getCuentasPagar()` tiene `.limit(500)` y varias rutas buscan por ID dentro de esa lista, así que con 501+ cuentas una cuenta válida responde "no encontrada" sin error ni log. | P0 |
| **B. Correctness serverless** | Trabajo que asume un proceso único de larga vida corriendo en funciones efímeras: broadcasts con `void Promise`, caches en `Map`, debounce de Sheets con `setTimeout`. Incluye un evento `bulk` de Realtime que se descarta en silencio y que la reconciliación oculta. | P0/P1 |
| **C. Superficie de riesgo** | `supabaseAdmin` accesible desde cualquier ruta, sin revocación de sesión para staff, `CRON_SECRET` que falla abierto si no existe, e idempotencia que trata cualquier error de INSERT como duplicado. | P1 |
| **D. Mantenibilidad** | `app/cotizaciones/[id]/page.tsx` con ~1,500 líneas y demasiadas responsabilidades, manejo de errores inconsistente, y lógica de upload duplicada en tres módulos. | P1/P2 |
| **E. Pruebas de carga** | Los tests actuales prueban correctness con 2-10 sesiones, no capacidad. Falta una suite (k6/Artillery) que responda objetivamente "¿aguanta si mañana entran 100 personas?". | P1 |

**Hallazgos completos, con el detalle de cada caso y la norma arquitectónica que debe
quedar establecida al cerrar cada frente:**
[`docs/archive/auditoria-ingenieria-2026-09.md`](archive/auditoria-ingenieria-2026-09.md).

Los bloques concretos se definen al auditar la iniciativa, no ahora.

---

## Después

**Sin definir a propósito.** Al cerrar 8.7 y Engineering Hardening se prioriza en
Chat, con el estado real del sistema a la vista.

El material candidato está en el roadmap de producto de 2026-09-04 (Fase 5, del que
ya se entregaron el Portal, el Dashboard con gastos fijos, y las bases de Proyectos y
Cuentas) más lo que surja de las dos iniciativas de arriba. Sigue pendiente de ese
documento: Cuentas agrupadas por proyecto y cruce fiscal, los agregados del Cotizador
(copiar entre cotizaciones, columna Costo + IVA, calculadora de impuestos), Proyectos
como herramienta de PM con asistente sobre el historial, y cerrar la migración visual.

Ninguno de esos está comprometido todavía.

---

## Features a medias

Están construidos parcialmente **a propósito**. No "arreglarlos" de paso sin
confirmar: cerrarlos es una iniciativa con alcance propio, no un fix incidental.

- **Google Calendar desde Proyectos** — la UI existe, el flujo end-to-end no cierra.
  En Planeación sí funciona; no asumir que es lo mismo.
- **Complementos de pago (CFDI)** — se suben y se registran, pero el XML no se parsea
  y la conciliación automática contra cuentas por cobrar no está hecha.
- **Órdenes de pago** — el CRUD y el PDF funcionan; los flujos de aprobación y firma
  no existen.
- **Plantillas de servicios** — completas para cotizaciones nuevas; la integración con
  cotizaciones COMPLEMENTARIA es parcial.
- **Rediseño visual (Fase 5.7)** — casi toda la app usa los tokens `--sn-*`. Siguen en
  estilo viejo: `app/login/page.tsx`, `app/admin/sheets/page.tsx` y los primitivos
  `components/ui/*` + `app/components/ui/Skeleton*`. Ver `DESIGN_SYSTEM.md`.

Si aparece otro feature a medias, documentarlo aquí.

---

## Cerrado

- **Colaboración en cotizaciones (Fases 0-8).** Edición simultánea con modelo
  server-authoritative, conflictos por campo, Realtime solo Presence.
  Historia: `docs/archive/fases-colaboracion-0-8.md`.
- **Roadmap de producto Fases 1-4 (2026-09-04).** Limpieza de deuda, riesgos, los 5
  fixes del incidente del 3 de septiembre y los ajustes de uso real.
- **Fase 5 parcial.** Portal de proveedores, Dashboard ejecutivo con gastos fijos, y
  las bases de Proyectos y Cuentas.

---

## Cómo se mantiene

Una iniciativa entra a **Siguiente** cuando se prioriza, pasa a `ACTIVE_WORK.md`
cuando arranca, y vuelve aquí como **Cerrado** cuando termina. Si generó una bitácora
larga, esa bitácora se archiva — no se queda en los documentos vivos.
