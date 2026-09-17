# Plan de la iniciativa activa

**Estado:** Aprobado, listo para ejecutar.

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a la
vez** — nace como borrador desde la primera idea, se refina en vivo (crear →
revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por bloque.
Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a un nombre que
caduca cuando la iniciativa cierra (es lo que le pasó al tracker de Engineering
Hardening, `docs/EF-3_ENGINEERING_HARDENING.md`, archivado en
[`docs/archive/ef-3-engineering-hardening.md`](archive/ef-3-engineering-hardening.md)).

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Cómo se mantiene").

## Ciclo de vida

1. **Vacío** — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** — una idea se confirma con alcance de iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando este
   archivo directamente.
4. **Aprobado** (este estado) — cualquier sesión o cuenta puede tomarlo desde
   aquí y ejecutar bloque por bloque, actualizando el tracker de estado
   conforme avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).

---

# Agrupar Cuentas por Pagar por proveedor+proyecto para facturación

## Contexto

Hoy `cuentas_pagar` se crea 1:1 por item de cotización (`approve_cotizacion`
inserta una fila por cada `items_cotizacion` con `x_pagar > 0`, índice único
`(cotizacion_id, item_id)`). Cuando un proveedor tiene varios items dentro del
mismo proyecto, el sistema le pide una factura por cada item por separado. Esto
es un error de negocio: el proveedor debe facturar el **total acumulado** de lo
que se le debe pagar en ese proyecto, no fragmentado por renglón.

Se necesita agrupar automáticamente, por `(proyecto_id, responsable_id)`, las
cuentas por pagar pendientes, para que la solicitud/validación de factura y el
registro de pago operen sobre el total agrupado. El caso de "factura
complementaria" (el proveedor agrega cosas después — vía edición del proyecto
o una cotización `COMPLEMENTARIA`, que ya es un tipo existente y comparte
`proyecto_id` con la principal) debe resolverse solo: los items nuevos deben
poder agruparse en una **nueva** solicitud de factura sin tocar la que ya se
facturó.

Decisiones de negocio confirmadas con el usuario (dos rondas de auditoría
externa sobre versiones previas del plan, cada señalamiento verificado contra
el código real antes de incorporarlo):
- Agrupación automática por `(proyecto_id, responsable_id)`.
- El grupo se **cierra cuando la factura sube y valida limpio** — cualquier
  item agregado después arranca un grupo nuevo automáticamente.
- Un grupo siempre se factura **completo** (sin selección parcial de items).
- El pago también es **agrupado** (un solo registro de pago cierra todo el
  grupo), con prorrateo determinista hacia las cuentas hija.
- Incluye el **Portal de Proveedores**.
- Migración retroactiva **solo** para `cuentas_pagar` en `PENDIENTE`, con
  `monto_pagado = 0` y sin documento de factura ya subido.
- Una orden de pago solo puede generarse sobre un grupo cuando **todas** las
  cotizaciones que le aportan items (principal + cualquier complementaria)
  tienen su evento ya realizado.

## Matriz de hallazgos / alcance

Invariantes confirmados en el código (no son suposiciones):

- `approve_cotizacion` es idempotente y solo transiciona `EMITIDA → APROBADA`
  una vez — sin riesgo de que una re-aprobación destruya cuentas ya
  agrupadas/facturadas.
- `x_pagar` de un item solo se puede editar mientras la cotización está en
  `BORRADOR`/`EMITIDA` (`patch_item_cotizacion`) — nunca cambia después de que
  un grupo existe.
- **Hueco real confirmado:** `app/api/items/[id]/route.ts` (reasignar
  proveedor de un item) hace `.update()` directo sobre `items_cotizacion` y
  `cuentas_pagar` **sin ningún guard de estado ni RPC**. Con grupos, esto
  puede dejar `cuenta.responsable_id != grupo.responsable_id` si no se cierra.
- `items_cotizacion.responsable_id`/`cuentas_pagar.responsable_id` son
  nullables (`Sin asignar` es un caso real).
- `db/migrations/_manifest.json` existe y lista las migraciones en orden.
- La ruta interna de subir factura guarda el documento aunque no cuadre
  (`estado_validacion = 'revision'`, resoluble manualmente vía
  `app/api/cuentas-pagar/[id]/documentos/[docId]/route.ts`); el Portal bloquea
  la subida si no cuadra.

## Opciones consideradas

- **Colapsar `cuentas_pagar` a 1 fila por proveedor+proyecto** — descartada:
  pierde trazabilidad por item, márgenes y reportes históricos.
- **Trigger de PostgreSQL para mantener grupos automáticamente** — descartada:
  menos auditable que RPCs explícitas, no es el patrón que ya usa el repo.
- **Nueva tabla `cuentas_pagar_grupos` + función de reconciliación explícita,
  llamada desde RPCs de negocio existentes (aprobación, reasignación, pago,
  orden de pago)** — elegida. `cuentas_pagar` sigue como ledger detallado;
  `cuentas_pagar_grupos` es la capa de agrupación encima.

## Diseño

### 1. Nueva tabla `cuentas_pagar_grupos`

```sql
create table cuentas_pagar_grupos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id text not null references proyectos(id),
  responsable_id uuid not null references proveedores(id),
  estado text not null default 'ABIERTO'
    check (estado in ('ABIERTO','FACTURADO','EN_PROCESO_PAGO','PAGADO')),
  monto_total numeric(15,2) not null default 0,
  monto_pagado numeric(15,2) not null default 0,
  orden_pago_id uuid references ordenes_pago(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index cuentas_pagar_grupos_abierto_unique
  on cuentas_pagar_grupos (proyecto_id, responsable_id)
  where estado = 'ABIERTO';
```

- `cuentas_pagar` gana `grupo_id uuid references cuentas_pagar_grupos(id)`,
  nullable siempre: una cuenta sin `responsable_id` nunca tiene grupo.
- `documentos_cuentas_pagar` gana `grupo_id` nullable, `cuentas_pagar_id` pasa
  a nullable, `CHECK` de que exactamente uno esté seteado. Documentos
  históricos no se tocan.
- `orden_pago_id` se agrega al grupo (no solo a `cuentas_pagar`).

### 2. `reconcile_cuenta_pagar_grupo(p_cuenta_pagar_id uuid)` — función única de reconciliación

Usada por aprobación Y por reasignación. Dado el estado actual de una cuenta,
hace que su pertenencia al grupo sea consistente:
- Sin `responsable_id` → no agrupa, limpia `grupo_id` previo si lo hubiera.
- Ya en el grupo correcto → solo refresca `monto_total` (caché recalculada,
  nunca fuente de verdad — se recalcula en cada punto de escritura).
- Proveedor cambió y el grupo viejo sigue `ABIERTO` → lo saca, recalcula
  ambos grupos (borra el viejo si quedó vacío), busca o crea el grupo
  `ABIERTO` del proveedor nuevo (protegido por el índice único parcial vía
  `ON CONFLICT ... WHERE estado = 'ABIERTO' DO NOTHING`).
- Proveedor cambió y el grupo viejo **no** está `ABIERTO` → `RAISE EXCEPTION`
  (código `P1412`), nunca un jsonb de error — así Postgres revierte
  automáticamente cualquier escritura previa de la misma transacción (esto
  corrigió un bug real de atomicidad que tenía una versión anterior de este
  plan, encontrado en la segunda ronda de auditoría).

### 3. Dos puntos de entrada

**a) `approve_cotizacion`** (cambio localizado, `CREATE OR REPLACE`): después
del `INSERT INTO cuentas_pagar` existente, loop sobre las filas recién
insertadas con `responsable_id is not null` llamando a
`reconcile_cuenta_pagar_grupo(cp.id)`.

**b) `reasignar_responsable_cuenta_pagar(...)`** (RPC nueva, reemplaza el
`.update()` directo de `app/api/items/[id]/route.ts`): dentro de **una sola
transacción**, actualiza `items_cotizacion` + `cuentas_pagar` y llama a
`reconcile_cuenta_pagar_grupo` — si esta última hace `RAISE EXCEPTION`
(`P1412`), Postgres revierte TODO lo anterior en la misma función, no solo la
reconciliación. La ruta responde `409` cuando `error.code === 'P1412'`
(mismo patrón que ya distingue `P1411` en `registrar-pago`).

### 4. Cierre del grupo (factura) y pago agrupado

- `subir-factura` por grupo: `estado_validacion = 'revision'` → documento se
  guarda, grupo sigue `ABIERTO`. `'validado'` → documento con `grupo_id`,
  grupo pasa a `FACTURADO`.
- Resolución manual de `revision`: extensión de
  `app/api/cuentas-pagar/[id]/documentos/[docId]/route.ts` (mecanismo ya
  existente) a una ruta hermana por grupo que además cierra el grupo si
  corresponde.
- Órdenes de pago: fuente pasa de cuentas individuales `PENDIENTE` a grupos
  `FACTURADO`. Elegible solo si **todas** las cotizaciones que aportan items
  al grupo tienen evento realizado. `orden_pago_id` se mueve al grupo.
- `registrar_pago_grupo_factura`: lock de grupo + hijas, prorrateo
  determinista hacia las hijas sobre el **saldo pendiente** (no el `x_pagar`
  original), residuo exacto a la última hija (orden estable por `id`).
  Invariantes: `0 <= hija.monto_pagado <= hija.x_pagar` y
  `SUM(hijas.monto_pagado) = grupo.monto_pagado`, siempre. Mismo mecanismo de
  idempotencia (`operation_id`) que `registrar_pago_cuenta_pagar`.

### 5-9. UI interna, Portal, migración retroactiva, documentación, decisiones descartadas

Ver detalle completo en el historial de esta sesión / PR de cada bloque. En
resumen: UI interna (`CuentaDetailModal`/`TabDocumentos`) opera sobre el
grupo; Portal migra a contrato agrupado (`GET /api/portal/cuentas` →
`{ grupos: [...] }`, sin fase de compatibilidad dual, único consumidor);
migración retroactiva solo agrupa `PENDIENTE`/`monto_pagado=0`/sin documento/
con `responsable_id`, nunca fusiona filas que ya tienen documentos
independientes; ADR nuevo `011-agrupacion-cuentas-pagar-por-proveedor-proyecto.md`
+ actualización de `006` (fórmula `monto_total_grupo = Σ x_pagar`) +
`ARCHITECTURE.md`.

## Bloques propuestos

1. **Esquema + función de reconciliación.** Tabla/columnas,
   `reconcile_cuenta_pagar_grupo`, `_manifest.json`. Sin tocar rutas/UI.
2. **Integración en aprobación y reasignación.** `approve_cotizacion` +
   `reasignar_responsable_cuenta_pagar` + migrar
   `app/api/items/[id]/route.ts`. Tests de concurrencia y de rollback
   atómico.
3. **Facturación + pago agrupados internos + órdenes de pago.**
   Endpoint de subir-factura por grupo, resolución manual de `revision`,
   `registrar_pago_grupo_factura` con prorrateo, integración con
   `generar-orden-pago`. UI interna. Rutas legacy por item intactas.
4. **Portal de Proveedores.** Contrato agrupado, endpoint + UI + tests juntos.
5. **Migración retroactiva de datos + documentación.** ADR 011, actualización
   de 006 y `ARCHITECTURE.md`.

## Tracker de estado

| Bloque | Estado | Rama/PR o Commit SHA | Nota |
|---|---|---|---|
| 1. Esquema + reconciliación | En curso (PR abierto) | `claude/epic-davinci-1fj7ki`, migración `20260917_cuentas_pagar_grupos.sql` | Tabla + columnas + `reconcile_cuenta_pagar_grupo` aplicados y probados en `serenata-erp-test` (4 escenarios vía SQL directo: sin responsable, crea grupo, mismo grupo, rechazo `P1412` con rollback atómico verificado). Advisors de seguridad limpios (RLS habilitado). `tsc`/`lint`/`test` (833/833) en verde local. |
| 2. Aprobación + reasignación | En curso (PR #73) | `claude/epic-davinci-1fj7ki`, migraciones `20260917_reconciliar_grupos_en_approve_cotizacion.sql` + `20260917_reasignar_responsable_cuenta_pagar.sql` | `approve_cotizacion` agrupa automáticamente (principal y complementaria); `app/api/items/[id]/route.ts` migrado a la RPC `reasignar_responsable_cuenta_pagar` (cierra el hueco real confirmado: reasignaba `cuentas_pagar` sin RPC ni guard). 8 escenarios probados en `serenata-erp-test` vía SQL directo: mismo proveedor+múltiples items→1 grupo, multiproveedor→2 grupos, multiproyecto→2 grupos, complementaria antes/después de FACTURADO, reasignación con grupo ABIERTO (reubica+recalcula ambos) y con grupo FACTURADO (rechazo P1412 con rollback atómico verificado en toda la cadena), señal de agrupación bajo dispatch paralelo. Test unitario nuevo (`items-route.test.ts`, 6 casos). `tsc`/`lint`/`test` (839/839) en verde local; `build` limpio en TypeScript (la recolección de page-data falla por falta de credenciales Supabase en el sandbox, no por el diff -- confirmado reproduciendo el mismo fallo con los cambios stasheados). |
| 3. Facturación + pago + órdenes | Pendiente | — | — |
| 4. Portal de Proveedores | Pendiente | — | — |
| 5. Migración retroactiva + docs | Pendiente | — | — |

## Criterio de cierre

- Los 5 bloques mergeados a `main`, cada uno con su PR en verde (`test`,
  `smoke-and-critical`, `fresh-db`, `live`, Vercel preview).
- Migración retroactiva aplicada en producción con conteo/suma verificado
  antes-después.
- ADR 011 y `docs/decisions/006` actualizados; `ARCHITECTURE.md` refleja el
  modelo nuevo.
- Prueba manual end-to-end confirmada: cotización con 2 items mismo
  proveedor → 1 grupo → factura por el total → complementaria → grupo nuevo
  → reasignar responsable con grupo facturado → rechazo → orden de pago →
  Portal muestra el total agrupado.
- `docs/PLAN.md` archivado a `docs/archive/agrupacion-cuentas-pagar-por-proveedor-proyecto.md`,
  resumen agregado a `docs/ROADMAP.md` → "Cerrado", `docs/PLAN.md` recreado vacío.
