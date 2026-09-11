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

Se dividirá en bloques al auditarla. Agrupación propuesta:

### A. Escalabilidad del acceso a datos — P0

El patrón "traer toda la tabla y filtrar en JavaScript" está en varios lugares y
falla en silencio conforme crecen los datos.

- `getCuentasPagar()` tiene `.limit(500)` y varias rutas por ID hacen
  `getCuentasPagar().find(c => c.id === id)`. Con 501+ cuentas, una cuenta válida
  empieza a responder "no encontrada". Mismo patrón en CxC. → separar List de Detail
  con queries directas por ID.
- El Dashboard carga CxC, CxP, cotizaciones, proyectos, gastos fijos y pagos
  completos, y calcula en Node. → agregados en PostgreSQL.
- `GET /api/cuentas-cobrar/alertas` **no es un GET puro**: carga todas las CxC y
  dispara N escrituras por cada visita a la pantalla. Dos usuarios abriendo a la vez
  ejecutan las actualizaciones dos veces. → consulta derivada, un UPDATE batch/RPC, o
  job periódico.

**Norma que queda al cerrar:** listas paginadas, detalle por ID, agregados en
PostgreSQL. Nunca traer una tabla completa para encontrar o calcular unas pocas
cosas, salvo dataset explícitamente acotado.

### B. Correctness serverless — P0/P1

Trabajo que asume un único proceso de larga vida, corriendo en funciones efímeras.

- Broadcast de Realtime disparado con `void Promise` — bajo serverless puede perderse
  después de la respuesta. Next `after()` / `waitUntil()`. La ruta de Partidas ya
  importa `after()` para otros efectos, pero no lo usa aquí.
- Evento Realtime de `bulk` descartado: el servidor manda `item_id: null` para bulk y
  el listener hace `if (!confirmed?.item_id) return`. La reconciliación lo corrige, o
  sea que el motor primario falla en silencio y el respaldo lo oculta.
- `CacheManager` sobre `new Map()` para folios, clientes, productos y proveedores: en
  Vercel cada instancia tiene su propio cache y los cold starts lo borran. Además
  `approval.ts` importa una función de invalidación **desde una API route**, lo que
  invierte las capas.
- `triggerSheetsSync()` usa `Map` + `setTimeout` en proceso: el debounce deja de ser
  global y puede duplicar, perder o solapar syncs.

**Norma que queda al cerrar:** ningún dato cuya frescura afecte correctness puede
depender de memoria de proceso. Una sola abstracción `postCommit()` para efectos
secundarios (Realtime, invalidación, Sheets), en vez de que cada módulo invente la
suya.

### C. Superficie de riesgo — P1

- `supabaseAdmin` se exporta desde `lib/supabase.ts` junto al cliente de browser y se
  usa directo en bastantes rutas. `service_role` es prácticamente root de la base. →
  `lib/server/supabase-admin.ts` con `import 'server-only'`, y el acceso siempre por
  API Route → Service → Repository.
- Auth de staff no tiene revocación equivalente a la del portal: un usuario
  desactivado conserva permisos en su JWT. → `auth_version`/`session_version`.
- `/api/keep-alive` compara contra `Bearer ${process.env.CRON_SECRET}`. Si el secret
  no existe, la cadena esperada es `Bearer undefined` y cualquiera puede mandarla. →
  validar que el secret exista antes de comparar.
- El helper de idempotencia trata **cualquier** error del INSERT como duplicado. Solo
  `23505 unique_violation` lo es; una DB caída o un timeout se traga como éxito.
- `idempotency_keys` y `rate_limits` no tienen política de retención.

### D. Mantenibilidad — P1/P2

- `app/cotizaciones/[id]/page.tsx` ronda las 1,500 líneas y coordina form, sesión,
  Presence, partidas, cálculos, mutation IDs, conflictos, autosave, reconciliación,
  timers y render. Antes de tomar Cotizaciones como template técnico del resto,
  extraer por responsabilidad: quotation controller, autosave controller,
  collaboration adapter, conflict controller, UI. **No por estética ni por reducir
  líneas** — para que Proyectos no herede un `page.tsx` de 1,700.
- Manejo de errores inconsistente (`console.error`, `instanceof Error`,
  `JSON.stringify`), con algunas APIs devolviendo el error técnico al navegador. Ya
  hubo que construir un helper aparte solo para el Portal, señal de que debe ser
  transversal: `DomainError` con código, status y `safeMessage`, más un logger con
  `requestId` que el cliente pueda citar.
- Lógica de upload duplicada (MIME XML/PDF, extensión, 10 MB) en Portal factura, CxP
  factura y CxC factura, más varias implementaciones de subida a Drive. El día que
  haya que validar magic bytes, se arreglan cuatro y se olvidan dos. → un
  `Document Ingestion Core` con la política común, y servicios por caso de uso.

### E. Pruebas de carga — P1

Los tests de concurrencia actuales prueban **correctness** con 2/3/5/10 sesiones, y
el propio test dice que no mide throughput ni latencia. Falta una suite aparte
(k6/Artillery) que simule el escenario objetivo: ~20 creando cotizaciones, 10
editando la misma, 30 navegando proyectos, 10-20 en CxC/CxP, 100-200 en el portal,
25-50 uploads concurrentes, 20 en Dashboard. Medir error rate, p50/p95/p99, CPU y
queries lentas de Supabase, duración de funciones de Vercel, conexiones y errores de
Realtime, errores de Drive y de Anthropic.

Responde de forma objetiva "¿aguanta si mañana entran 100 personas?", sin necesidad
de 100 personas.

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
