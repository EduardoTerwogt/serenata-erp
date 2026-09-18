# 011 — Agrupación de Cuentas por Pagar por proveedor+proyecto

## Contexto

`cuentas_pagar` se crea 1:1 por renglón de cotización (`approve_cotizacion`
inserta una fila por cada `items_cotizacion` con `x_pagar > 0`). Cuando un
proveedor tenía varios renglones dentro del mismo proyecto, el sistema le
pedía una factura por cada renglón por separado — error de negocio: un
proveedor factura el total acumulado de lo que se le debe pagar en ese
proyecto, no fragmentado por renglón.

El caso de "factura complementaria" (el proveedor agrega cosas después —
vía edición del proyecto o una cotización `COMPLEMENTARIA`, tipo ya
existente que comparte `proyecto_id` con la principal) debía resolverse
solo: los renglones nuevos se agrupan en una **nueva** solicitud de factura
sin tocar la que ya se facturó.

Plan completo, matriz de hallazgos y bloques de ejecución: `docs/PLAN.md`
(archivado al cerrar esta iniciativa). El plan pasó por dos rondas de
auditoría externa sobre versiones previas; cada señalamiento se verificó
contra el código real antes de incorporarlo — corrigió, entre otras cosas,
un bug real de atomicidad (`RAISE EXCEPTION` en vez de un jsonb de error
cuando una reasignación de proveedor debía revertir escrituras previas de
la misma transacción).

## Decisión

**Nueva tabla `cuentas_pagar_grupos`, capa de agrupación encima de
`cuentas_pagar` (que sigue siendo el ledger detallado por renglón —
trazabilidad, márgenes y reportes históricos intactos).**

- Agrupación **automática** por `(proyecto_id, responsable_id)`, mantenida
  por una función única de reconciliación (`reconcile_cuenta_pagar_grupo`)
  llamada desde los puntos de entrada que ya existían (`approve_cotizacion`,
  reasignación de responsable) — no un trigger de Postgres (menos auditable,
  no es el patrón que ya usa el repo).
- El grupo se **cierra cuando la factura sube y valida limpio**
  (`estado = 'FACTURADO'`) — cualquier renglón agregado después arranca un
  grupo `ABIERTO` nuevo automáticamente, sin acción manual.
- Un grupo siempre se factura y se paga **completo** (sin selección parcial
  de renglones). El pago usa prorrateo determinista hacia las cuentas hija,
  sobre su saldo pendiente (no su `x_pagar` original), con la última hija
  recibiendo el residuo exacto — garantiza
  `SUM(hijas.monto_pagado) = grupo.monto_pagado` siempre.
- Reasignar el proveedor de una cuenta cuyo grupo ya no está `ABIERTO`
  (ya tiene factura o pago real) se **rechaza explícito** (`409`,
  código Postgres `P1412`) — nunca se reubica en silencio.
- Una orden de pago solo puede generarse sobre un grupo `FACTURADO` cuando
  **todas** las cotizaciones que le aportan renglones (principal +
  cualquier complementaria) tienen su evento ya realizado — el grupo es una
  sola obligación conjunta.
- Incluye el **Portal de Proveedores**: contrato nuevo, no transicional
  (único consumidor real), con las cuentas legacy sin grupo todavía
  visibles como grupos sintéticos de un solo renglón (nunca facturables por
  esa vía, nunca invisibles).
- Migración retroactiva de datos con alcance angosto: solo `cuentas_pagar`
  en `PENDIENTE`, `monto_pagado = 0`, con `responsable_id` real y **sin**
  documento ya subido. Cualquier otra fila se deja intacta.

## Razón

- Fusionar renglones en una sola fila de `cuentas_pagar` habría destruido
  trazabilidad por renglón, márgenes y reportes históricos que ya dependen
  de esa granularidad.
- Reusar la RPC de reconciliación desde cada punto de entrada (aprobación,
  reasignación, migración retroactiva) es más auditable que un trigger
  implícito, y es el patrón que el repo ya usa para toda operación
  financiera multi-write (ver `docs/decisions/007`).
- El rechazo explícito al reasignar un proveedor con grupo ya facturado
  evita que `cuenta.responsable_id` y `grupo.responsable_id` queden
  desincronizados en silencio.
- El alcance angosto de la migración retroactiva evita fusionar filas que
  ya tienen su propio papeleo (factura o pago) resuelto de forma
  individual — fusionarlas falsearía qué documento cubre qué.

## Alternativas descartadas

- **Colapsar `cuentas_pagar` a 1 fila por proveedor+proyecto.**
- **Trigger de PostgreSQL para mantener los grupos automáticamente.**
- **Proveedor ficticio "Sin asignar"** para forzar que toda cuenta tenga
  grupo — una cuenta sin `responsable_id` real nunca se agrupa, sigue el
  flujo legacy hasta que se le asigne un proveedor real.
- **Migración retroactiva amplia** (fusionar toda fila sin grupo,
  independientemente de si ya tiene documento o pago) — descartada por el
  riesgo de falsear trazabilidad ya resuelta.

## Consecuencias

- Un hueco real preexistente quedó cerrado en el camino: reasignar el
  proveedor de un renglón ya aprobado (`app/api/items/[id]/route.ts`) hacía
  `.update()` directo sobre `items_cotizacion`/`cuentas_pagar` sin RPC ni
  guard — ahora pasa por `reasignar_responsable_cuenta_pagar`, transacción
  única.
- `generar-orden-pago` migró de cuentas individuales `PENDIENTE` a grupos
  `FACTURADO` como fuente; se agregó un `UNION ALL` que preserva el
  criterio anterior para cuentas sin `grupo_id` todavía, evitando dejarlas
  inalcanzables entre que este bloque se mergeó y que corrió la migración
  retroactiva.
- El Portal de Proveedores cambia de "una factura por renglón" a "una
  factura por proyecto" — impacto de UX en proveedores con el flujo
  aprendido; comunicarlo es decisión de negocio, fuera de alcance técnico.
- **Lección de proceso real de esta iniciativa:** las migraciones de los
  Bloques 1-3 se probaron exhaustivamente contra `serenata-erp-test` pero
  no se aplicaron a producción de inmediato — quedaron pendientes hasta
  que una prueba manual del usuario en el Preview de Vercel expuso que
  nada estaba agrupando en el ambiente real. Confirmado con una auditoría
  completa de esquema (tablas/columnas/funciones, no solo el log de
  migraciones aplicadas) que el resto de Engineering Hardening sí estaba
  correctamente desplegado — el hueco fue específico a esta iniciativa. A
  partir de aquí, cada migración se aplica a producción en el mismo bloque
  en que se valida en test, no se difiere.
- **Segunda lección de proceso, encontrada al cerrar la iniciativa:**
  `db/migrations/20260917_reconciliar_grupos_en_approve_cotizacion.sql`
  (Bloque 2) se escribió `CREATE OR REPLACE FUNCTION approve_cotizacion`
  sobre una copia vieja de la función — de antes de
  `20260911_approve_cotizacion_restore_proyecto_id.sql`, que ya había
  corregido una vez la falta de `proyecto_id` en el upsert de
  `cuentas_cobrar`. El comentario de la migración de Bloque 2 afirmaba que
  "todo lo demás ... queda exactamente igual"; era falso, y la regresión
  volvió a colar el mismo bug (una cotización complementaria aprobada dejaba
  de aparecer en Cuentas por Cobrar). Corregido en
  `20260918_fix_approve_cotizacion_cuenta_cobrar_proyecto_id.sql`, con
  backfill de la única fila real afectada en producción (`SH071-A`). **Norma
  a partir de aquí:** al reemplazar una función existente vía
  `CREATE OR REPLACE`, partir siempre de la migración más reciente que la
  define (confirmarlo contra `pg_proc.prosrc` en producción o el manifiesto,
  no de memoria ni de una copia local desactualizada), y diffear
  explícitamente contra esa versión antes de asumir que "el resto queda
  igual".

## Glosario

Ver `docs/decisions/006-reglas-de-negocio-invariables.md` (fórmula
`monto_total_grupo`, definición de "Grupo de facturación").
