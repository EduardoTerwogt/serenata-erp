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
6. **Agrupar la vista interna de Cuentas por Pagar (Lista y Por proyecto).**
   Hallazgo del usuario tras revisar el Preview de PR #73: el Bloque 3 solo
   agrupó el modal de detalle, no los listados que abren ese detalle. RPC
   nueva `buscar_cuentas_pagar_grupos` para "Lista", agrupación client-side
   en "Por proyecto" (`cuentas_por_proyecto()` ampliada con
   `grupo_estado`/`grupo_monto_total`/`grupo_monto_pagado`).
7. **Reordenar el detalle de Cuentas por Pagar (modal de grupo).** Con la
   Lista/Por proyecto ya agrupadas, el usuario pidió limpiar el modal de
   detalle: solo folio/responsable/proyecto/fecha factura arriba, la
   tarjeta de grupo sin resaltar ningún item como "actual", cruce fiscal, y
   contacto al final.
8. **Hotfix — restaurar `proyecto_id` en `cuentas_cobrar` (regresión del
   Bloque 2).** Al cerrar la iniciativa, el usuario probó el flujo completo
   y encontró que una cotización complementaria aprobada dejaba de aparecer
   en Cuentas por Cobrar. `20260917_reconciliar_grupos_en_approve_cotizacion.sql`
   (Bloque 2) se había escrito sobre una copia vieja de `approve_cotizacion`,
   de antes de que `20260911_approve_cotizacion_restore_proyecto_id.sql` ya
   hubiera corregido este mismo problema una vez.

## Tracker de estado

| Bloque | Estado | Rama/PR o Commit SHA | Nota |
|---|---|---|---|
| 1. Esquema + reconciliación | Cerrado (PR #73) | `main`, commit `6c60a46`, migración `20260917_cuentas_pagar_grupos.sql` | Tabla + columnas + `reconcile_cuenta_pagar_grupo` aplicados y probados en `serenata-erp-test` (4 escenarios vía SQL directo: sin responsable, crea grupo, mismo grupo, rechazo `P1412` con rollback atómico verificado). Advisors de seguridad limpios (RLS habilitado). `tsc`/`lint`/`test` (833/833) en verde local. |
| 2. Aprobación + reasignación | Cerrado (PR #73) | `main`, commit `6c60a46`, migraciones `20260917_reconciliar_grupos_en_approve_cotizacion.sql` + `20260917_reasignar_responsable_cuenta_pagar.sql` | `approve_cotizacion` agrupa automáticamente (principal y complementaria); `app/api/items/[id]/route.ts` migrado a la RPC `reasignar_responsable_cuenta_pagar` (cierra el hueco real confirmado: reasignaba `cuentas_pagar` sin RPC ni guard). 8 escenarios probados en `serenata-erp-test` vía SQL directo: mismo proveedor+múltiples items→1 grupo, multiproveedor→2 grupos, multiproyecto→2 grupos, complementaria antes/después de FACTURADO, reasignación con grupo ABIERTO (reubica+recalcula ambos) y con grupo FACTURADO (rechazo P1412 con rollback atómico verificado en toda la cadena), señal de agrupación bajo dispatch paralelo. Test unitario nuevo (`items-route.test.ts`, 6 casos). `tsc`/`lint`/`test` (839/839) en verde local; `build` limpio en TypeScript (la recolección de page-data falla por falta de credenciales Supabase en el sandbox, no por el diff -- confirmado reproduciendo el mismo fallo con los cambios stasheados). |
| 3. Facturación + pago + órdenes | Cerrado (PR #73) | `main`, commit `6c60a46`, migraciones `20260917_orden_pago_grupos_facturados_eventos_realizados.sql` + `20260917_registrar_pago_grupo_factura.sql` | Rutas nuevas `grupos/[id]/subir-factura`, `grupos/[id]/documentos/[docId]` (resolución manual de `revision`, cierra el grupo a `FACTURADO` si corresponde), `grupos/[id]/registrar-pago` y `grupos/[id]/registrar-pago/estado` (reconciliación de idempotencia, contraparte agrupada de la ruta por item). `generar-orden-pago` migrado a fuente por grupo, con `UNION ALL` que preserva el criterio anterior para cuentas sin `grupo_id` todavía (hueco real encontrado y corregido: sin esto, cuentas preexistentes habrían quedado inalcanzables hasta el Bloque 5). Probado en `serenata-erp-test`: prorrateo exacto en pago único y en dos pagos sucesivos (`SUM(hijas)=grupo.monto_pagado` siempre, ninguna hija excede `x_pagar`), idempotencia (mismo `operation_id` no duplica), rechazo `P1413` sobre grupo no facturable, y los 3 casos de elegibilidad para orden de pago (grupo facturado con eventos realizados incluido, grupo con complementaria futura excluido, cuenta legacy sin grupo incluida). Limpieza: `getCuentasPagarPendientesEventosRealizados`/`updateCuentasPagarEnOrden` (JS) eliminados por quedar sin ningún caller. UI interna terminada: `CuentaDetailModal`/`TabInformacion`/`TabDocumentos`/`TabRegistrarPago` muestran y operan sobre el grupo (tarjeta de grupo con desglose de items hermanos, cruce fiscal sobre el total del grupo, banners de contexto agrupado, bloqueo del pago mientras el grupo no esté `FACTURADO`) — diseño validado contra un mockup interactivo aprobado explícitamente por el usuario antes de implementar. `useCuentasPagar`/`reconcilePagoEstado`/`runIdempotentPagoSubmit` ganan el dominio `cuentas-pagar-grupos`. `tsc`/`lint`/`test` (878/878) en verde local; `build` limpio en TypeScript (la recolección de page-data sigue fallando solo por falta de credenciales Supabase en el sandbox -- confirmado reproduciendo el mismo fallo con los cambios stasheados, incluidos los archivos nuevos). Pendiente: correr `smoke`/`critical`/`live` en CI vía el PR. |
| 4. Portal de Proveedores | Cerrado (PR #73) | `main`, commit `6c60a46` (bloque original `d8a0258`) | Contrato agrupado (`{ grupos: [...] }`, sin fase de compatibilidad dual): cada cuenta con `grupo_id` se agrega bajo su grupo real (facturable solo si `ABIERTO`); cuentas legacy sin `grupo_id` todavía se muestran como grupos sintéticos de un solo renglón, visibles pero nunca facturables por esta vía (evita que desaparezcan de la vista del proveedor mientras la migración retroactiva no las alcance). Ruta nueva `POST /api/portal/cuentas/grupos/[id]/factura` reemplaza a `/cuentas/[id]/factura` (retirada) -- mismo comportamiento de bloqueo que ya tenía el Portal (nunca guarda si no cuadra). `TabCuentas` selecciona por proyecto/grupo, con desglose de renglones. Sin migraciones nuevas -- reutiliza tablas/RPCs del Bloque 1-3. `tsc`/`lint`/`test` (881/881) en verde local. |
| 5. Migración retroactiva + docs | Cerrado (PR #73) | `main`, commit `6c60a46`, migración `20260918_migracion_retroactiva_cuentas_pagar_grupos.sql` | Reutiliza `reconcile_cuenta_pagar_grupo()` sobre las cuentas elegibles (`PENDIENTE`, `monto_pagado=0`, `responsable_id` real, sin documento) en vez de reimplementar la lógica. Validada en `serenata-erp-test` (10979 cuentas, mismo total y suma antes/después, 10978 grupos creados, 0 desincronizados) y aplicada a producción con el mismo conteo/suma verificado (62 cuentas sin cambio, 4→11 grupos, 0 elegibles restantes, 0 desincronizados). ADR `011-agrupacion-cuentas-pagar-por-proveedor-proyecto.md` creado; `006` actualizado (fórmula `monto_total_grupo`, glosario); `ARCHITECTURE.md` con sección nueva "Cuentas por Pagar agrupadas por proveedor+proyecto" + tabla actualizada. **Hallazgo real de esta iniciativa, documentado en el ADR:** las migraciones de los Bloques 1-3 se probaron en `serenata-erp-test` pero no se habían aplicado a producción hasta que una prueba manual del usuario lo expuso -- confirmado y corregido con una auditoría completa de esquema; el resto de Engineering Hardening sí estaba correctamente desplegado. |
| 6. Agrupar vista interna (Lista + Por proyecto) | Cerrado (PR #73) | `main`, commit `6c60a46`, migraciones `20260918_buscar_cuentas_pagar_grupos.sql` + `20260918_cuentas_por_proyecto_incluir_grupo.sql` | Hallazgo del usuario tras revisar el Preview: el Bloque 3 solo agrupó el modal de detalle -- "Lista" y "Por proyecto" seguían mostrando una fila por item. RPC nueva `buscar_cuentas_pagar_grupos` reemplaza a `buscar_cuentas_pagar` como fuente de la vista "Lista" (se deja desplegada sin caller, mismo patrón de limpieza del Bloque 3); una fila de grupo real trae `estado`/`x_pagar`/`monto_pagado` del grupo más `es_grupo`/`items_count`, una cuenta legacy sin `grupo_id` se muestra como su propio grupo de 1 item. `cuentas_por_proyecto()` ampliada con `grupo_estado`/`grupo_monto_total`/`grupo_monto_pagado` por item (`LEFT JOIN cuentas_pagar_grupos`) para que "Por proyecto" agrupe en JS (`agruparCuentasPagarPorGrupo`, `selectors.ts`) sin necesitar una RPC paginada nueva -- ese proyecto ya carga su arreglo completo de una vez. El `id` expuesto en ambas vistas sigue siendo el del item representante (el más antiguo del grupo), a propósito: el detalle existente (`GET /api/cuentas-pagar/:id/documentos`, el modal ya agrupado del Bloque 3) sigue funcionando sin ningún cambio. Ambas migraciones verificadas contra `serenata-erp-test` y contra producción con datos reales (grupo de Diego Torres/SH003 en test; grupos reales de Eduardo Terwogt/SH071 y otros en producción, totales agregados exactos). De paso se corrigió un hueco real encontrado en el camino: `regimen_fiscal` extraído de la constancia por el parser AI nunca se persistía -- ahora se guarda solo si el proveedor no tenía uno ya asignado, sin pisar nunca una corrección manual de staff (`app/api/portal/documentos/route.ts`). `tsc`/`lint`/`test` (885/885) en verde local; `build` limpio en TypeScript (la recolección de page-data sigue fallando solo por falta de credenciales Supabase en el sandbox, no por el diff). |
| 7. Reordenar detalle (modal de grupo) | Cerrado (PR #73) | `main`, commit `6c60a46` | Con la Lista/Por proyecto ya agrupadas, el usuario pidió limpiar `TabInformacion.tsx` (tab "Información" del modal de detalle): ahora solo muestra folio/responsable(editable)/proyecto/fecha factura arriba, la tarjeta "Grupo de facturación" (sin resaltar ningún item como "actual" -- se quitó el pill, el punto en acento y el sufijo "· este item"), cruce fiscal, e información de contacto; Notas e Historial de reasignación se quedan al final. Se quitaron del todo los campos sueltos Descripción Item/Monto x Pagar/Monto Pagado/Saldo Pendiente (esa info ya vive dentro de la tarjeta de grupo). Cuentas legacy sin `grupo_id` (grupo real `null`) sintetizan un "grupo" de 1 item a partir de la propia cuenta (`GrupoFacturacionCard` recibe una forma mínima `{estado, monto_total, responsable_nombre, items}`, no ya `CuentaPagarGrupo` directo) para que la tarjeta nunca desaparezca. `resumen` (monto_pagado/saldo_pendiente) dejó de pasarse a `TabInformacion` en `CuentaDetailModal.tsx` por quedar sin uso -- el contrato de `GET /api/cuentas-pagar/[id]/documentos` no se tocó. `tsc`/`lint`/`test` (885/885) en verde local; `build` limpio en TypeScript (mismo límite de credenciales Supabase en el sandbox). PR #73 (Bloques 1-7 completos) mergeado a `main` con CI en verde (`test`/`tracker-lint`/`fresh-db`/`smoke-and-critical`/`live`, Vercel preview). |
| 8. Hotfix -- `proyecto_id` en `cuentas_cobrar` | Cerrado (PR #74) | `main`, commit `3640f36` | Regresión encontrada por el usuario al cerrar la iniciativa: una cotización complementaria aprobada dejaba de aparecer en Cuentas por Cobrar. Causa raíz confirmada línea por línea: `20260917_reconciliar_grupos_en_approve_cotizacion.sql` (Bloque 2) se escribió sobre una copia vieja de `approve_cotizacion` -- de antes de `20260911_approve_cotizacion_restore_proyecto_id.sql`, que ya había corregido la falta de `proyecto_id` en el upsert de `cuentas_cobrar` una vez. El comentario de esa migración afirmaba que "cuenta_cobrar queda exactamente igual" -- falso. Nueva migración `20260918_fix_approve_cotizacion_cuenta_cobrar_proyecto_id.sql`: restaura `proyecto_id` en el INSERT y el `ON CONFLICT DO UPDATE SET`, manteniendo intacto el loop de `reconcile_cuenta_pagar_grupo()` (funcionalidad legítima del Bloque 2), más un backfill de una sola vez. Verificado en `serenata-erp-test` (aprobación real de una complementaria de prueba) y en producción (1 fila real afectada, `SH071-A`, corregida y visible en `cuentas_por_proyecto()`). Documentado como segunda lección de proceso en `docs/decisions/011` -- norma nueva: al reemplazar una función vía `CREATE OR REPLACE`, partir siempre de su versión más reciente confirmada (`pg_proc.prosrc` o el manifiesto), nunca de una copia local desactualizada. `tsc`/`lint`/`test` (885/885) en verde, sin cambios JS/TS. |

## Criterio de cierre

- Los 8 bloques mergeados a `main`, cada uno con su PR en verde (`test`,
  `smoke-and-critical`, `fresh-db`, `live`, Vercel preview).
- Migración retroactiva aplicada en producción con conteo/suma verificado
  antes-después.
- ADR 011 y `docs/decisions/006` actualizados; `ARCHITECTURE.md` refleja el
  modelo nuevo.
- Prueba manual end-to-end confirmada: en vez de un recorrido único de
  punta a punta, cada pieza (agrupación por proveedor+proyecto, factura,
  pago, reasignación con rechazo, orden de pago, Portal) se probó por
  separado con SQL directo contra `serenata-erp-test`/producción (ver
  tracker, Bloques 1-6), más la revisión manual del usuario sobre el
  Preview real (Bloques 6-7) — que además encontró y llevó a corregir la
  regresión del Bloque 8. El usuario dio esta cobertura por suficiente para
  cerrar la parte de Cuentas por Pagar/Proveedores.
- `docs/PLAN.md` archivado a `docs/archive/agrupacion-cuentas-pagar-por-proveedor-proyecto.md`,
  resumen agregado a `docs/ROADMAP.md` → "Cerrado", `docs/PLAN.md` recreado vacío.
