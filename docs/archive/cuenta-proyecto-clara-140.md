# Plan de la iniciativa activa

**Estado:** **Cerrado — lanzado a producción el 2026-10-10** (PR [#142](https://github.com/EduardoTerwogt/serenata-erp/pull/142), merge `56d520a`; migración `20261042` en test y producción). Iniciativa [#140](https://github.com/EduardoTerwogt/serenata-erp/issues/140). Decisión: `docs/decisions/026`.

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a
la vez** — nace como borrador desde la primera idea, se refina en vivo (crear
→ revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por
bloque. Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a
un nombre que caduca cuando la iniciativa cierra.

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Siguiente"/"Después").

## Ciclo de vida

1. **Vacío** — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** — una idea se confirma con alcance de iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando
   este archivo directamente.
4. **Aprobado** — cualquier sesión o cuenta puede tomarlo desde aquí y
   ejecutar bloque por bloque, actualizando el tracker de estado conforme
   avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).

Última iniciativa cerrada: "Frente 2 de Cuentas: leer lo que se muestra" (#110; lanzada a
producción el 2026-10-09, PR #136) — historia y mediciones en
`docs/archive/frente2-historico-cuentas-110.md`, decisión en `docs/decisions/025`.
Anterior: "Facturas y pagos ligados" (#123, con #130 y #131) —
`docs/archive/facturas-pagos-ligados-123-130-131.md`.

---

# #140 — Cuenta de proyecto clara para no contadores (plan v4)

> **v4 (respuestas de producto y roadmap):** sin cambios de código ni de alcance técnico respecto a v3; agrega la sección «Decisiones de producto confirmadas»: no se avisa de renglones sin costo (equipo propio = ingreso íntegro; se resuelve en el issue de montos, que debe distinguir equipo propio de pendiente de proveedor), «Libre para usar» se conserva, el monto vive en `costo_total`, y #140 entra **después de verificar #110**.
>
> **Historial:** v1 → v2 (9 desajustes con el código, tabla de abajo) → v3 (4 ajustes menores de la segunda revisión): (1) aceptación del golden reformulada, porque `cierre` gana 2 campos y `cierre_mensual` pierde filas; (2) alerta de cuadre solo si `|cuadre_diferencia| > 0.01`; (3) la tarjeta móvil de `TablaConceptos` gana el botón de paso (hoy no muestra el paso); (4) el pop up lleva sus propios manejadores de marcado (~8 líneas) en vez de extraerlos de `DestinoProveedor`. Confirmado: el motor arma `cuadre_diferencia` en `tests/support/cuentas-motor/periodo.ts` (~l. 291).

> Issue [#140](https://github.com/EduardoTerwogt/serenata-erp/issues/140). Maqueta aprobada (artefacto privado): https://claude.ai/artifact/VStbYWKYVQX9Nez4EGFUXj (v15). Aprobado el 2026-10-09; **ejecución diferida**: B0 abre la ejecución, B1–B5 tras verificar #110.

## Veredicto de la revisión (equipo senior contra el código real)

**El plan v1 no era implementable tal cual.** Se encontraron 9 desajustes con el repo; todos ya corregidos abajo. Los que cambian el alcance:

| Rol | Hallazgo (verificado en el código) | Corrección |
|---|---|---|
| Backend / QA | `round2` falla solo con |x| < 1e-6 (notación científica). Basta `if (Math.abs(value) < 0.005) return 0`; no hace falta `toFixed`. La prueba vive en `lib/server/shared/__tests__/decimal.test.ts` (ya existe), no en `lib/shared/__tests__` | B0 = una línea + casos en ese archivo |
| Data | Para la retención real no hace falta comprobar el snapshot: sin factura el residuo da exactamente la estimación. Y basta cambiar **tres referencias** a `cierre_iva_retenido` en `cuentas_periodo` (l. 863 y 1004 de `20261040`) vía una columna derivada en el CTE `con`; `cuentas_conceptos` no se toca | Regla: `ret_iva = residuo` si está dentro de tolerancia, si no la estimada |
| Data / Backend | `diferencia_facturas` (Σ por fila) era más complejo que el problema. El control es una sola ecuación en `pj`: `cuadre_diferencia = round(cobros_total − pagos_total − sat_total − utilidad_bruta, 2)`; detecta también guardas de datos rotas | Dos campos nuevos en `cierre`: `sat_total`, `cuadre_diferencia` |
| Data | La tolerancia del validador (0.03 % del subtotal) no cubre el residuo: se acumulan IVA ±0.01, ISR ±0.01 y total ±0.01 | Tolerancia = `max(0.01, 0.0003·neto) + 0.03` |
| QA | El motor TS (`cierre-proyecto.ts`) no conoce cobros; `cuadre_diferencia` se ensambla en `periodo.ts` del motor. La paridad también cubre `totales.impuestos` (retenciones cambian por centavos) | Golden/paridad: diferencias esperadas en `cierre`, `cierre_mensual` y `totales.impuestos` |
| Frontend | El tono de alerta «Sin factura» **no** va en `TONO_ESTADO`: el decoder y el motor lo reproducen y la paridad compara `tono`. Es una condición de presentación (`cobro` + `sin_factura` + `pagado>0`) | Helper puro en el front, sin tocar el contrato |
| Frontend | El panel móvil usa `CuerpoProyecto compacto acciones=…`; quitar `compacto` obliga a conservar `acciones` (Reabrir). En proyectos **históricos** (escrituras → 409) y conceptos **sin proyecto** no deben salir botones | `onAccion` solo si `!p.historico` y `proyecto_id`; «Asignar» solo con proyecto |
| DevOps | Falta regenerar `db/migrations/_manifest.json` (`node scripts/check-migrations.mjs`; lo compara `check-schema-parity`). `cuentas_periodo` pesa ~25 KB: en producción se aplica con el truco `DO` + `pg_get_functiondef` (convención del repo) y se verifica `md5(prosrc)` contra el archivo | Pasos explícitos en el orden |
| Product | La maqueta rotulaba el renglón mensual «IVA trasladado»; en la fuente es **IVA a enterar del mes** (trasladado − acreditable pagado ese mes) y el renglón pendiente negativo es **IVA acreditable por aplicar** | Se corrige maqueta y SQL |

**¿Es la forma más simple?** Sí, tras estos ajustes: cero tablas/columnas, una migración de 2 funciones, una API nueva sobre una función existente, 1 componente nuevo grande (pop up) + 1 archivo de resumen; se borran 4 componentes y el recálculo en pantalla. Alternativas descartadas más abajo.

## Context

La cuenta de proyecto (`app/cuentas/components/ProyectoPanel.tsx`) repite utilidad e IVA, presenta el ISR como pago con fecha y «utilidad neta», no distingue lo aproximado de lo real y no contesta «¿cuánto me deja y qué falta?». El «Ajuste −$9.09» de SH001 es un bug de `round2`, no de datos.

Alcance: **presentación + cálculo único en SQL**. Ninguna función se pierde (tabla «Funciones de hoy y dónde quedan» de la maqueta). Cotizar, aprobar, pagar y facturar no cambian.

Invariante: `cobrado con IVA = a transferir + SAT (IVA neto + retenciones) + utilidad antes de ISR`. SH001: 11,600.00/1,169.20 · 9,533.33/3,235.87 · mixto 11,187.00/1,582.20; utilidad 7,307.50; ISR ref. 2,192.25.

## Decisiones de diseño (acordadas)

- Una sola tabla de montos: `cuentas_pagar.costo_total` / `cuentas_pagar_grupos.monto_total` = neto vigente; lo «real» = `total_a_transferir`; aproximado = `total_estimado`. **Sin columnas ni tablas nuevas.**
- «~» delante del monto aproximado; sin chip ni tooltip. Colores: cliente verde, proveedores naranja, SAT azul/gris, ISR de referencia azul.
- «Siguiente paso» = botón (solo en el panel del proyecto; la vista Lista no cambia):
  | Paso | Destino |
  |---|---|
  | Subir factura (cliente y proveedor; `emitir_factura` se rotula «Subir factura»), Subir complemento | Ventana «Subir factura» (`{sheet:'factura', lado, cid, pre}`) |
  | Pagar | «Registrar pago» preseleccionada |
  | Asignar proveedor | Pop up nuevo |
  | Revisar factura/complemento, Indicar PUE/PPD | Detalle, pestaña Documentos |
  | Subir comprobante | Detalle, pestaña Pago («Adjuntar comprobante»; «Registrar pago» duplicaría el pago) |
  | En orden de pago | Texto |
  La fila sigue abriendo el detalle.
- Pop up: `SelectorContraparte` cerrado por defecto, «Proveedor nuevo» (nombre, RFC, régimen, teléfono, correo, banco, CLABE) y, si hay otros conceptos del proyecto **sin proveedor**, su lista para marcarlos.
- Chip de pendientes = `p.cuentas.pendientes`; la leyenda ya no repite el conteo. Aviso del IVA con el mes del cobro y solo si ese mes no terminó (`periodo.hoy`). Chip del SAT = suma de los renglones (iva + retenciones) con la fecha límite más próxima; con mes cerrado dice ese monto.

## Bloques y tracker (todos «Hecho» el 2026-10-10, PR #142; pendiente: revisión en Preview y merge)

| Bloque | Qué | Cuándo |
|---|---|---|
| **B0** | Arreglo de `round2` + pruebas (PR aparte) | Hecho |
| B1 | Migración `20261042` + tipos TS + motor de pruebas + `scripts/db/cuenta-proyecto-prueba.sql` | Hecho |
| B2 | Ruta `POST /api/cuentas/proveedores/asignar` + schema extraído | Hecho |
| B3 | Panel: `ProyectoResumen` (veredicto, franja, sobres, detalle contable), `~`, borrado de `Metricas`/`Cierre` | Hecho |
| B4 | Botones de «Siguiente paso» + pop up `AsignarProveedor` + «Subir factura» como rótulo | Hecho |
| B5 | Docs: ADR 026, `ARCHITECTURE.md`, `TESTING.md`, `ROADMAP.md`; issue nuevo de montos | Hecho |

## Fase 0 — B0 (PR aparte, sale primero)

`lib/shared/decimal.ts`: `if (Math.abs(value) < 0.005) return 0` al inicio de `round2`. Pruebas en `lib/server/shared/__tests__/decimal.test.ts`: `8476.7−1169.2−7307.5 → 0`, `±1e-7`, `±1e-13`, `0.005 → 0.01`, y los 100.005 existentes. Cierra el −$9.09 y posibles saldos fantasma (`status`, `orden-cruce`, `detalle-armar`, `Totales`).

## Fase 1 — SQL y contratos (sin tocar la UI)

**Migración única** `db/migrations/20261042_cuenta_proyecto_cierre.sql` (+ regenerar `_manifest.json`). Solo `CREATE OR REPLACE`, firmas iguales, sin `DROP`, sin DDL:

1. `cuentas_cierre_mensual` (~120 l.): borrar filas `isr` y `proveedores` (y su código muerto); fila pendiente con monto < 0 → «IVA acreditable» / «Se descuenta en el mes en que pagues»; retenciones pendientes → «17 del mes siguiente al pago».
2. `cuentas_periodo` (cuerpo exacto de `20261040` + 3 cambios): (a) `con` agrega `ret_iva_cierre = residuo` (`neto + cierre_iva − total − cierre_isr_retenido`) si |residuo − estimada| ≤ `max(0.01, 0.0003·neto) + 0.03`, si no `cierre_iva_retenido`; (b) `proj` y `sel_cierre` usan `ret_iva_cierre`; (c) `pj` agrega `sat_total` y `cuadre_diferencia`, y `sel_cierre` los expone en `cierre`. **No** se toca `cuentas_conceptos` ni la fuente de la utilidad (hoy `cot.utilidad ≡ cobros_sin_iva − pagos_neto` por las guardas `cp_costo_total`/`cobro_total`; cambiarla es del issue de montos editables).
3. Sin guarda nueva en `auditar_consistencia()` (`cuadre_diferencia` ya la hace visible por proyecto).

**TS:** `CierreProyecto` (`lib/shared/cierre-proyecto.ts`) + `sat_total`, `cuadre_diferencia` (requeridos; los únicos literales a actualizar son `cuentas-periodo-route.test.ts` y el motor con su test; el motor arma `cuadre_diferencia` en `periodo.ts` ~l. 291, donde ya tiene `cierre` y `totales`); la alerta de la UI solo salta si `|cuadre_diferencia| > 0.01` (mismo umbral de las guardas; evita falsas alarmas por redondeo de `margen_total`); `ConceptoCierre`/`FilaCierre` (`periodo-tipos.ts`) sin `'proveedores'`/`'isr'`; `periodo-sql.ts` sin cambios de forma. Motor `tests/support/cuentas-motor/{cierre-proyecto,cierre-mensual,periodo}.ts` y sus tests reflejan lo mismo (conserva la paridad `live`; sin recortarla).

**API única nueva:** `POST /api/cuentas/proveedores/asignar` → `prepararGrupoFacturaProveedor` (`lib/server/cuentas/preparar-grupo.ts`; ya transaccional, valida RFC/régimen/correo/CLABE en SQL, asigna con `reasignar_responsable_cuenta_pagar`, registra historial, no exige factura). `requireSection('cuentas')` primero, Zod antes del body; schema: se **extrae** `ProveedorNuevoSchema` de `FacturaCrearSchema.preparar` (`lib/validation/schemas.ts`) y lo usan ambas rutas; `operation_id` uuid obligatorio (lo exige la RPC). Los 409 (`proyecto_historico`, `proveedor_existente`, `renglon_bloqueado`) salen por `buildErrorResponse`. Descartado: `PATCH /api/items/[id]` ×N + `POST /api/proveedores` (no atómico, sin régimen/CLABE, otra sección).

**Pruebas de la fase:** `scripts/db/cuenta-proyecto-prueba.sql` (3 casos SH001 + propiedad aleatoria: régimen, retenciones dentro/fuera de tolerancia, con y sin factura → `cuadre_diferencia = 0` salvo fuera de tolerancia); golden de lecturas de Cuentas con aceptación **reformulada** (el md5 de `cuentas_periodo` con `proyecto` ya no puede dar 0 diferencias porque `cierre` gana 2 campos y `cierre_mensual` pierde filas): idéntico en `cuentas_conceptos`, `resumen` y `avisos`, y en `cuentas_periodo` tras quitar `sat_total`, `cuadre_diferencia` y las filas `isr`/`proveedores`; diferencias de centavos solo en retenciones de grupos con factura real. Unitarias de la ruta (401/403, 400 Zod, 409 histórico, proveedor repetido); `__tests__/api-route-guards.test.ts`; `plpgsql_check`; ACL sin cambios (`aclexplode`); base limpia desde las migraciones.

## Fase 2 — Interfaz (mobile-first; solo lee `cierre`)

- `ProyectoPanel.tsx`: se **borran** `conciliacionUtilidad`, `LineasConciliacion`, `Metricas`, `Cierre` y el modo `compacto` (queda `acciones` para el panel móvil). Se conservan `EncabezadoProyecto`, `Aviso`, `leyendaCierre` (sin conteo), `Linea`.
- `ProyectoResumen.tsx` (nuevo, 1 archivo): veredicto, franja del cliente, 3 sobres, detalle contable (cuadre, SAT por mes, por proveedor). Lógica de texto en `resumen-proyecto.ts` (puro, con pruebas unitarias): veredicto por conteos de `p.conceptos`, aviso del IVA, chip del SAT, urgencia del cliente sin factura. El dinero sale solo de `totales` y `cierre`.
- `Conceptos.tsx`: `TablaConceptos` conserva estructura y columnas; `PagadoTotal` antepone «~» si `total_estimado`; `SiguientePaso` dibuja botón solo con `onAccion` (con `stopPropagation`, como `ChipsCompartidos`). La tarjeta móvil (`renderMobileCard`) hoy **no** muestra el paso: se le agrega el botón en una línea, como en la maqueta.
- `CuentasApp.tsx`: `abrirPaso(c)` junto a `abrirCompartido` (misma conversión concepto→`{lado,cid,pre}` que ya existe), `abrir({det, tab})` para el detalle; estado local para el pop up (transitorio); pasa `hoy`.
- `acciones/AsignarProveedor.tsx` (nuevo): `Modal` + `CUERPO_VENTANA`/`PieVentana`, `SelectorContraparte`, `AltaProveedor` (se generaliza: RFC/nombre/régimen editables sin XML), `ConceptosProyecto` (prop `soloPorAsignar` = filtra `!responsable_id`), `accionesAsignar` en `useAcciones.ts`. Los manejadores de marcado (`alternar`/`marcarVarios`) hoy son locales de `DestinoProveedor` y atados a su estado (`grupoExacto`); el pop up lleva los suyos (~8 líneas sobre un arreglo de ids) en vez de forzar una extracción; `SelectorContraparte` con `pendiente:'todos'` ya lo admite la API.
- `lib/shared/cuentas/concepto.ts`: `emitir_factura: 'Subir factura'` + 3 pruebas (`cuentas-periodo-route.test.ts`, `concepto.test.ts`, `detalle-armar.test.ts`). Los avisos («por emitir») no cambian. `Totales.tsx`/Dashboard fuera de alcance.
- Maqueta: renglón mensual «IVA a enterar · mes» y pendiente «IVA acreditable por aplicar».

**Pruebas:** unitarias de `resumen-proyecto.ts`; del pop up (solo conceptos sin proveedor, validación de alta); E2E `tests/e2e/critical/cuentas-principal.spec.ts` (único que cita los textos viejos) + smoke móvil/escritorio; botones ausentes en histórico y sin proyecto.

## Orden y migración segura

1. B0 → merge. 2. Rama + PR borrador: migración en `serenata-erp-test` → verificar → **producción antes del merge** (`DO`-patch, `md5(prosrc)` de 2 funciones, ACL, `proconfig`, `auditar_consistencia()` = 0). 3. Motor + tipos + ruta. 4. UI. 5. «Ready for review» (job `live`), Preview. 6. Docs: ADR 026, `ARCHITECTURE.md`, `TESTING.md`, `ROADMAP.md`.
- Reversión: re-aplicar las 2 funciones de `20261040`. Compatibilidad: sin cambios de esquema ni datos; la UI vieja funciona con la función nueva (campos conservados; desaparecen 2 tipos de fila mensual); facturas ya validadas siguen válidas.

## Criterios

| Criterio | Cumplimiento |
|---|---|
| Tablas / fuentes duplicadas | Ninguna nueva; `costo_total`, `total_a_transferir`, `total_estimado`; se elimina el recálculo en pantalla. Tolerancia espejada del validador, comentada |
| APIs / componentes / utilidades duplicados | 1 ruta sobre función existente + schema extraído; reusa selector, alta, checklist, modal, tabla; `round2` se arregla en su lugar; mapeo concepto→contexto reutilizado |
| Dependencias / extensiones / migraciones | 0 / 0 / 1 (solo funciones) |
| Deuda evitable | Se borra código (ISR/proveedores del cierre, 4 componentes); motor al día |
| Fuente de verdad | Dinero: SQL (`totales`, `cierre`); utilidad: guardas existentes; ISR: referencia |
| Migración / datos | `CREATE OR REPLACE`, reversible, antes del merge; sin cambios de datos |
| Seguridad / permisos / RLS | Sin tablas nuevas (RLS n/a, todo vía `service_role` en servidor); `requireSection('cuentas')`+Zod+operation_id; ACL de funciones; trigger de histórico; test de guardias |
| Regresión | Invariante (3 casos + propiedad), golden, paridad `live`, E2E, `round2`, histórico, sin proyecto |
| Orden | B0 → SQL test → prod → motor/ruta → UI |
| Alternativa más simple | Descartadas: recalcular en TS; tolerancia ±0.50 en «Cuadra»; PATCH×N; guarda nueva en `auditar_consistencia`; `toFixed` en `round2` |

## Riesgos

- **P1** `cuentas_periodo` (la lectura más cara; 57014 en CI): solo se añade una columna derivada y dos expresiones; medir buffers antes/después.
- **P1** Reemplazar ~25 KB de función: aplicar con `DO`-patch y verificar `md5(prosrc)`.
- **P2** La vista Lista muestra «~»; revisión visual. **No sé:** si hay facturas aceptadas fuera de tolerancia en producción (hoy no hay datos reales).

## Fuera de alcance (issue nuevo, con tu visto bueno)

«Capturar y editar montos a proveedor desde la cotización o desde Cuentas, antes de tener factura»: renglones sin monto (hoy no crean cuenta: `costo_unitario > 0`), editar `costo_total` con su grupo, utilidad = `cobros_sin_iva − pagos_neto`, reformular la guarda `cp_costo_total`.

## Verificación

`npx tsc --noEmit && npm run lint && npm test`; `scripts/db/cuenta-proyecto-prueba.sql` + golden contra BD limpia (`scripts/db/local-up.sh`); `npm run test:e2e:smoke && npm run test:e2e:critical`; `npm run build`; CI con job `live`; revisión manual en Preview con SH001 (sin proveedores, 4 físicas, mixto) en móvil y escritorio; `auditar_consistencia()` = 0 en producción.

## Decisiones de producto confirmadas (preguntas de producto y roadmap)

- **Utilidad con renglones sin costo:** no se avisa en #140. Serenata tiene equipo propio que no se paga, así que un renglón sin costo puede ser ingreso íntegro y legítimo; el resto va a proveedor y su costo se captura después. Se documenta en el ADR 026 y se resuelve en el **issue nuevo de montos**, que además debe distinguir «equipo propio» (sin costo, ingreso íntegro) de «pendiente de proveedor/costo» (la lista de equipos propios todavía no existe como dato: pendiente de definir ahí).
- **Texto «Libre para usar»:** se queda (misma cifra: utilidad − 30 % de ISR de referencia).
- **Dueño del monto:** sin decisión nueva. El monto vigente vive en `cuentas_pagar.costo_total`; cualquier pantalla (Cuentas, cotización o, más adelante, Proyectos #101) edita ese único campo. #101 solo lo leería.
- **Secuencia:** #140 entra **después de verificar el lanzamiento de #110** (puntos 0 y 1 de «Pendiente del usuario» en `docs/ACTIVE_WORK.md`: filtro de #139, `k6 cuentas.js` con `VUS=5`, `Server-Timing` de `periodo`, cron `keep-alive` → 200 con `archivado.ok`, respaldo manual). #125 conserva su revisión del 2026-11-01. **B0 es el primer bloque de la ejecución** (arreglo independiente y chico, PR aparte); no espera la verificación de #110. Los bloques B1–B5 sí esperan.

## Decisiones por defecto (revisables antes de ejecutar cada bloque)

1. B0 como PR aparte, primero. 2. Crear el issue nuevo y anotarlo en `ROADMAP.md`. 3. Factura aceptada fuera de tolerancia: alerta arriba + diferencia en el detalle (no se reparte como retención). 4. Alerta en «Sin factura» del cliente con cobro: sí. 5. Naranja de utilidad y veredicto → tinta oscura. 6. Chip del SAT con mes cerrado muestra el monto que vence. 7. Paridad `live` se conserva.
