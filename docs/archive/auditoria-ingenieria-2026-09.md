# Auditoría de ingeniería — 2026-09

> **Documento de referencia.** Hallazgos completos de la auditoría externa que da
> origen a la iniciativa **Engineering Hardening** de `docs/ROADMAP.md`. Leer al
> arrancar esa iniciativa, no antes: mientras tanto el resumen del roadmap basta.
>
> Ninguno de estos hallazgos obliga a reescribir el sistema. Todos son corregibles
> incrementalmente.

## Foto general

Los puntos fuertes medidos: arquitectura base, separación por dominios, concurrencia
en Cotizaciones y testing funcional. Los débiles: testing de carga (prácticamente
inexistente), observabilidad, escalabilidad del acceso a datos y correctness bajo
serverless.

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
