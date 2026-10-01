# 020 — Simplificación del modelo de datos: un dueño por dato

**Estado: Aceptada — alternativa B** (2026-10-01, #106). Decisiones D1–D6 y
plan por bloques en `docs/PLAN.md`. Sheets queda solo de lectura (D2); los
datos de prueba de producción se pueden borrar (D3); tareas y documentos de
proyecto se conservan (D4).

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

### B — A + el grupo como única obligación de pago (**recomendada**)

Todo lo de A, más:

- **Toda cuenta por pagar con proveedor pertenece a un grupo.** Las 47 sueltas
  se migran a grupos de un renglón (el portal ya las muestra así como "grupos
  sintéticos", decisión 011). Las cuentas sin proveedor ("Sin asignar") quedan
  como renglones sin grupo y **no pagables** hasta asignarse, igual que hoy en
  la práctica.
- `cuentas_pagar` deja de guardar estado de pago: `estado`, `monto_pagado`,
  `orden_pago_id`, `total_a_transferir`, `monto_transferido` viven solo en el
  grupo. Pagos y documentos cuelgan solo del grupo.
- `cuentas_pagar.x_pagar` se renombra a `costo_total` (H5).
- `pago_operations` y `bulk_import_operations` se absorben en
  `idempotency_keys` (H10).

- **Gana:** desaparece la rama "suelta" de ~10 RPCs, del `UNION ALL` de
  órdenes, del portal y de la derivación TS. `cuentas_conceptos` pierde una
  fuente efectiva de estado, y el frente 2 (`cuentas_conceptos_base`) se
  re-evalúa con menos triggers o se vuelve innecesario.
- **Costo:** alto. Toca RPCs de pago (`registrar_pago_*`, `anular_pago_*`,
  `generar_orden_pago`, `cancelar_orden_pago`, `validar_factura_proveedor`,
  `corregir_*`, `cancel_cotizacion`, `approve_cotizacion`) con paridad SQL/TS
  obligatoria (decisión 017).
- **Riesgo:** P0 (dinero). Se mitiga con expandir → migrar lectores → verificar
  → contraer, guardas de consistencia en cero y el dataset de carga de test.

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

**B**, ejecutada por bloques en el orden de `docs/PLAN.md`, con A como primer
tramo (ya entrega valor si B se detiene). C no.

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

- Sheets deja de ser vía de escritura: se retira `sync-up` (D2).
- El frente 2 (decisión 019) espera a B4: su diseño depende de cuántas tablas
  alimenten los conceptos.
- Los documentos que describen el esquema (`ARCHITECTURE.md`,
  `docs/decisions/006`, `011`, `017`) se actualizan en el bloque que los cambia.
