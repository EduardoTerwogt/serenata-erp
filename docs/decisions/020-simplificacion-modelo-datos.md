# 020 — Simplificación del modelo de datos: un dueño por dato

**Estado: Aceptada — alternativa B, ejecutada** (2026-10-01, #106; cierre 2026-10-02, ver "Resultado"). Decisiones D1–D7 y
plan v3 (dos auditorías) en `docs/PLAN.md`. Sheets se retira (D2); los datos
de prueba de producción se reinician (D3); tareas y documentos de proyecto se
conservan (D4); el cómputo no se sube (D7).

## Contexto

El usuario percibe la base desordenada: datos repetidos, información dispersa
y más tablas de las que la app necesita. La fase 2 (#105,
`docs/inventario-tablas.md` → "Fase 2") lo confirmó con datos de producción,
pero con un matiz: **el problema no es el número de tablas, es el estado
duplicado**. Cuatro patrones lo explican casi todo:

1. **Copias de datos de terceros** que ya divergen (H1–H4, H8): contacto del
   proveedor en `cuentas_pagar` (10 de 82 filas ya distintas), nombres de
   cliente y proyecto en texto, lista de proyectos dentro de `clientes`.
2. **Derivados guardados** que se quedan viejos (H6, H7): 13 renglones con la
   fórmula de margen anterior; `historial_responsable` es una caché regenerada.
3. **Dos caminos para la misma obligación** (H9): `cuentas_pagar` con grupo y
   sin grupo ("suelta"). En la rama con grupo, cinco columnas de la hija están
   muertas; en la rama suelta, viven ahí. ~10 RPCs y la derivación TS cargan
   ambas ramas.
4. **Una puerta trasera** (H11): Sheets → Supabase escribe directo sobre las
   tablas de dinero, sin RPC. Cualquier simplificación del esquema la rompe, y
   hoy ya puede saltarse invariantes.

La regla que ordena todo: **cada dato tiene un solo dueño; los demás lo leen
por llave o lo congelan a propósito (snapshot documentado)**. Un snapshot es
legítimo solo si el negocio necesita el valor *de ese momento* (PDF emitido,
desglose de una orden, total del CFDI). Lo demás es copia accidental.

## Alternativas

### A — Limpieza sin tocar los flujos de dinero

Quitar copias y derivados (H2, H3, H4, H6, H7, H8), residuo (H12), FKs y tipos
(H13). Sheets queda solo de lectura en tablas financieras (H11).

- **Gana:** ~15 columnas y 2 tablas menos; termina la divergencia de contacto y
  nombres; margen ya no puede quedar viejo.
- **No resuelve:** los dos caminos de `cuentas_pagar` ni las tres
  idempotencias. Cuentas sigue igual de difícil de leer.
- **Costo:** medio. ~12 funciones SQL, ~10 archivos TS, Sheets, tests.
- **Riesgo:** P1. No cambia reglas de dinero.

### B — A + el grupo como única vía de pago + un solo motor de Cuentas (**elegida**)

Todo lo de A, más:

- **Toda cuenta por pagar con proveedor pertenece a un grupo**; pagos,
  facturas y órdenes solo por grupo. El renglón conserva su desglose de pago
  prorrateado (decisión 011) y el "suelto por asignar" (sin proveedor) sigue
  existiendo en la UI.
- Salen de `cuentas_pagar` las columnas que solo usaba la rama suelta
  (`orden_pago_id`, `total_a_transferir`, `monto_transferido`, `metodo_pago`)
  y las copias de proveedor y renglón.
- Las reglas de Cuentas quedan solo en SQL (#108); el TS presenta.

- **Gana:** desaparece la rama "suelta pagable" de ~10 RPCs y del `UNION ALL`
  de órdenes; termina la paridad SQL/TS; el frente 2 se re-evalúa con menos
  fuentes.
- **Costo:** alto, concentrado en una expansión y una contracción de Cuentas.
- **Riesgo:** P0 (dinero). Mitigaciones en `docs/PLAN.md` (plan v2).
- **Descartado tras auditoría:** renombrar `x_pagar` (A7) y unificar la
  idempotencia (A8).

### C — B + unificar cobrar y pagar en tablas únicas

Una tabla `cuentas` con dirección (cobro/pago), una de `pagos`, una de
`documentos`.

- **Gana:** −3 tablas más.
- **Pierde:** las diferencias son reales (grupos, órdenes, neto vs transferido,
  estimado, `metodo_pago_cfdi`, complemento ligado a un pago, folio CC/CP). La
  tabla única queda llena de columnas que aplican a un solo lado, cada RPC
  necesita un discriminador y las FKs dejan de expresar las reglas (un pago de
  proveedor podría colgar de un cobro). Más dispersión de reglas, no menos.
- **Descartada** salvo que el usuario la pida explícitamente.

## Recomendación

**B**, ejecutada por bloques según el plan v2 de `docs/PLAN.md` (auditado). C no.

## Reglas para no romper nada (aplican a todos los bloques)

1. **Expandir → migrar lectores → verificar → contraer.** Nunca se borra una
   columna en la misma migración que crea su reemplazo. Entre ambas hay un
   deploy con todos los lectores ya en la fuente nueva.
2. **Mapa de dependencias antes de cada contracción:** `grep` en `app/`,
   `lib/`, `components/`, `scripts/`, tests y `lib/integrations/sheets/schema.ts`
   **+** `pg_get_functiondef` de todas las funciones de `public` **+**
   triggers, vistas y políticas. Cero coincidencias o no se borra.
3. **Guardas de consistencia** (las consultas de la fase 2) en un script
   versionado; deben dar 0 antes y después de cada bloque, en test y en prod.
4. **Paridad SQL/TS** (decisión 017) y **re-escribir funciones desde
   `pg_get_functiondef` de producción**, nunca de memoria ni de una migración
   vieja (lección de la decisión 011).
5. Cada bloque: test (con el dataset de carga) → PR con `test`, `fresh-db`,
   `smoke-and-critical` y `live` verdes → prod → guardas en 0.

## Consecuencias

- Se retira la integración con Google Sheets (D2).
- El frente 2 (decisión 019) espera a B4: su diseño depende de cuántas tablas
  alimenten los conceptos.
- Los documentos que describen el esquema (`ARCHITECTURE.md`,
  `docs/decisions/006`, `011`, `017`) se actualizan en el bloque que los cambia.

## Resultado (2026-10-02)

Ejecutada con migraciones numeradas `20261016`–`20261027`, aplicadas a mano en test y
producción (las que contienen DROP) o por el MCP (las aditivas). Producción, tras retirar
`cliente_id_backfill_clasificacion` (`20261027`, residuo de la migración de clientes que
el reinicio dejó vacío): 34 tablas y 1 vista (`historial_responsable`, antes tabla; el
Schema Visualizer de Supabase la cuenta como tabla, así que muestra 35), 72 funciones,
113 índices. Test tiene además `loadtest_runs`, la única excepción declarada.

**Regla de dueño único.** Cada dato vive en una tabla y el resto lo lee: el proveedor de
una cuenta por pagar sale de `proveedores`; descripción, cantidad y margen, de
`items_cotizacion` por `item_id` (uuid NOT NULL, FK compuesta con la cotización); el
cliente, de `cotizaciones.cliente_id` → `clientes`. Salen `cuentas_pagar` sin copias,
`proyectos.cliente`/`cliente_id`, `cuentas_cobrar.cliente`/`proyecto`/`cliente_id`,
`items_cotizacion.responsable_nombre`, `x_pagar` (ahora `costo_unitario` y `costo_total`),
`registrar_pago_cuenta_pagar` y las funciones `buscar_*`.

**Integridad en la base, no por convención.** FKs compuestas, CHECK de `importe`, `margen`
y fecha de entrega, restricción diferida "proveedor ⇒ grupo" y "cuenta y renglón del
mismo proveedor" (P1417), cotización aprobada congelada por trigger (P1419), estado de la
cotización solo por RPC (L1), estado del cobro como columna generada (D15), `date` y
`timestamptz` donde había texto o hora sin zona. Las guardas viven en
`auditar_consistencia()` (17, cron diario, Admin) y `plpgsql_check` (CI).

**Decisiones que cambiaron en la ejecución.**
- **B6 (un solo motor de Cuentas, D17) se hizo después del cierre**, sin diferirlo como deuda:
  el proyecto seleccionado (con cierre fiscal y cierre mensual) sale de `cuentas_periodo` y
  el detalle de un concepto de `cuentas_conceptos` con ese solo concepto (`20261028`,
  `20261029`; sin DROP: la función de 2 argumentos quedó como envoltura de la de 4). El
  motor TS pasó a `tests/support/cuentas-motor/` como **doble de pruebas** de los mocks e2e,
  vigilado por `cuentas-paridad-sql.spec.ts` (periodo, proyecto seleccionado, cierre mensual
  con 300 casos y filas de detalle). Residuo conocido y aceptado: `detalle-armar.ts` elige el
  documento más reciente de cada tipo para mostrarlo; es presentación, la regla que decide
  el estado vive en SQL.
- **Frente 2 de latencia en pausa** con disparador explícito (~4,000 proyectos en total,
  ~2,500 en un año o p95 de `escala.yml` sobre 650 ms). Hoy `resumen`, `avisos` y
  candidatos de orden recorren todo el historial y crecen lineal; la palanca barata es
  acotarlos a lo no resuelto antes de rediseñar.
- **Sin respaldo previo al reinicio de producción (G7):** sus datos son de prueba,
  inventados; el plan Free sin respaldos sigue siendo un riesgo para el día de uso real y
  se decide entonces.
- **Poda de índices:** 0 índices redundantes y los 30 sin uso en test son 4 de 19 MB, casi
  todos de 8–16 kB en tablas chicas; no se retiró ninguno (`scripts/db/indices-sin-uso.sql`
  sirve para revisar con estadísticas de producción con uso real).
- **Herramientas retiradas:** `foto-dorada`, `mapa-dependencias` y `guardas-modelo.sql`
  (absorbidas por `auditar_consistencia()`).

**Lecciones.** (1) Producción llevaba migraciones sin aplicar (`20261020`, `20261023`):
antes de correr la siguiente, verificar el estado real de la base. (2) Una migración con
DROP se corre completa desde el raw del archivo, no por partes. (3) `serenata-erp-test`
también la usan el job `live` y los Previews: un recorrido manual a la vez que corre la
CI mezcla ruido con fallas reales.

**Para el módulo de Proyectos (F14).** `proyectos` conserva solo identidad, fecha de
entrega (`date`), estado y datos operativos; el cliente y el nombre del evento se leen
de la cotización (`proyectos.id = cotizaciones.id`). Cualquier campo nuevo debe decidir
primero quién es su dueño y no copiarse a Cuentas.

**Pendiente de producto (#119):** `/cotizaciones/nueva` y `/cotizaciones/[id]` siguen
siendo dos motores de edición de la misma cotización.
