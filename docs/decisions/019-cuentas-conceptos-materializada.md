# 019 — `cuentas_conceptos_base`: los conceptos de Cuentas se guardan derivados y se mantienen con triggers

**Estado: SUSTITUIDA (2026-10-09) por [`025`](025-historico-de-cuentas-190-dias.md).** La tabla `cuentas_conceptos_base` y sus triggers
(PR #100) **nunca llegaron a `main` ni a producción**; el PR se cerró como reemplazado. Se conserva como historia de por qué se descartó
mantener un espejo derivado con triggers en ~14 tablas (#110, `docs/PLAN.md`).

## Contexto

Cada RPC de lectura de Cuentas (`cuentas_periodo`, `cuentas_resumen`,
`cuentas_avisos_items`, `cuentas_opciones`) recalculaba `cuentas_conceptos` desde
cero. Sobre el dataset de carga de `serenata-erp-test` (2,202 proyectos,
13,193 conceptos al año) eso cuesta 224–330 ms por llamada, y el job `live`
exige p95 < 800 ms por endpoint (decisión 017, O1b/S4). Con la base de test
compartida y ruidosa, ese margen se rompía de forma intermitente: el PR #100
(issue #99) falló 3 veces seguidas en ese gate.

**Objetivo de escala (dicho por el usuario, 2026-09-30):** producción hoy tiene
28 proyectos, 35 cobros y 89 pagos, y se usa solo para pruebas manuales. Pasará
a uso real cuando el ambiente de test con miles de datos sea estable, y **ese
ambiente es lo que producción debe aguantar**. Por eso el dataset permanente de
EF-3A y el presupuesto de 800 ms son requisitos reales, no un ejercicio de
laboratorio. Hoy leer Cuentas en producción cuesta ~22 ms; la tabla no cambia
nada visible ahí, es margen para el volumen objetivo.

## Decisión

Tabla `cuentas_conceptos_base` con una fila por concepto (todo lo que no depende
de "hoy"), mantenida **al día en la misma transacción de cada escritura**. Las
cuatro RPCs leen de ahí; `venc_dias`, el estado `vencido`, `paso_urgente` y el
orden de proyectos se calculan al leer. Migración `20261009` (consolidada).

- **Derivación:** `cuentas_conceptos_derivar(p_year, p_proyectos, p_hoy)` es la
  derivación de siempre con filtro opcional por proyecto (plpgsql,
  `force_custom_plan`: como función SQL el plan genérico tardaba ~7.5 s). Con
  `p_hoy` NULL corre en "modo tabla". El tipo `cuentas_concepto_t` define la
  forma de un concepto una sola vez.
- **Refresco:** los triggers de las 11 tablas fuente (`cotizaciones`,
  `proyectos`, `proveedores`, `cuentas_cobrar`, `cuentas_pagar`,
  `cuentas_pagar_grupos`, `cuentas_reaperturas`, `documentos_cuentas_cobrar`,
  `documentos_cuentas_pagar`, `pagos_comprobantes`, `pagos_cuentas_pagar`)
  marcan los proyectos afectados (OLD y NEW) en `cuentas_conceptos_pendientes`.
  Un constraint trigger diferido vacía la cola **una vez por transacción**, toma
  un advisory lock por proyecto en orden fijo y llama a
  `cuentas_conceptos_refrescar`.
- **Red de seguridad:** `cuentas_conceptos_reconciliar()` compara la tabla con la
  derivación completa y corrige lo que no coincide; `/api/keep-alive` la corre
  cada día y lo reporta. Como cada escritura actualiza la tabla en su misma
  transacción, un desfase real solo viene de `TRUNCATE`, triggers apagados o
  ediciones directas: no hay falsos positivos por escrituras en curso.
  `cuentas_conceptos_diferencias` es el detector que usan los tests.
- **Cargas masivas:** `SET LOCAL serenata.sin_refresco = 'on'` apaga el marcado
  en esa transacción y al final se llama `cuentas_conceptos_reconstruir()`.

## Desviación del diseño aprobado

El plan inicial pedía triggers `FOR EACH STATEMENT` con tablas de transición.
Se implementó por fila con cola y constraint trigger diferido porque una RPC con
muchas sentencias (aprobar, cancelar, pagar) refrescaría varias veces el mismo
proyecto; con la cola se refresca una vez al commit.

## Alternativas descartadas

- **Una RPC única `cuentas_carga`** que derive una vez para las cuatro lecturas:
  el test de rendimiento mide cada endpoint por separado y en serie, así que no
  baja el tiempo que falla.
- **Vista materializada:** refresco completo con cada escritura.
- **Refresco al leer** (implementado y descartado en CI, commit `0572ff3`): la
  frescura dependía de que cada lector sincronizara y `cuentas-paridad-sql`,
  que llama las funciones SQL directo, vio filas de un proyecto ya borrado;
  además el viaje extra por lectura dejó el p95 en 963 y 1046 ms. Sincronizar
  dentro de la función de lectura tampoco es seguro: PostgREST puede abrir las
  funciones `STABLE` en modo solo lectura y volverlas `VOLATILE` rompe la
  consistencia de snapshot entre sus consultas.

## Costos medidos (base de test, ruidosa)

- Lectura: `cuentas_periodo` (mes) 311 → 140 ms; `cuentas_resumen` 261 → 84 ms.
  Los 5 tests de rendimiento pasaron con p95 < 800 ms.
- Refresco al commit: `pg_stat_statements`, 713 llamadas, media 141 ms, máximo
  2.9 s. Se paga dentro de cada escritura y se serializa por proyecto.
- **Corrección de diagnóstico:** el timeout de los B7 en la corrida `c7b2fad` se
  atribuyó al refresco, pero comparando las duraciones de los 76 tests entre
  dos corridas con el mismo código, el entorno completo estuvo +20 % más lento
  (también en tests que solo leen). La causa no quedó demostrada.
- Un `UPDATE` de solo `estado` sobre 500 cobros (lo que hace el cron diario
  `sync_estados_cuentas_cobrar_vencidas`) marcaba 498 proyectos y su commit
  tardaba 882 ms de refresco inútil. Los triggers de `UPDATE` de
  `cuentas_cobrar`, `cuentas_pagar` y `cuentas_pagar_grupos` solo disparan si
  cambia una columna que la derivación lee; ahora marca 0.

## Riesgos aceptados

- **Si la derivación falla, la escritura de negocio falla** (principio 4,
  fallar explícito). Ya ocurrió en test durante el desarrollo (tipos `varchar`
  contra `text`). Lo vigilan la paridad en CI (`cuentas_conceptos_diferencias`
  = 0 en `cuentas-paridad-sql` y `cuentas-b1b`) y la reconciliación diaria.
- **Lo que solo aparece en PostgREST:** Supabase precarga `pg_safeupdate` en el
  rol `authenticator` (rechaza `DELETE` sin `WHERE`), y además `statement_timeout`
  y `lock_timeout` de 8 s. Probar triggers o RPCs con el rol `postgres` no lo
  detecta; solo el job `live` lo ejerce.
- Las lecturas siguen siendo lineales en los conceptos del año: la tabla es un
  factor constante (~5×), no un cambio de orden.

## Mantenimiento: reglas

- Si la derivación pasa a leer **otra tabla**, hay que agregar su trigger.
- Si pasa a leer **otra columna** de `cuentas_cobrar`, `cuentas_pagar` o
  `cuentas_pagar_grupos`, hay que agregarla al `WHEN` de su trigger de `UPDATE`
  (`trigger_cuentas_conceptos_upd`); de lo contrario el cambio no refresca y
  solo lo atrapa la reconciliación del día siguiente.
- Agregar una columna al concepto: el tipo `cuentas_concepto_t`, las dos ramas
  de `cuentas_conceptos_derivar`, `cuentas_conceptos_leer` y un `ALTER TABLE`
  sobre `cuentas_conceptos_base` (una migración nueva).
- Cubrir el caso en `tests/e2e/live/cuentas-b1b.spec.ts` o en la paridad.

## Consolidación de migraciones

Las piezas se construyeron en varias entregas (tabla, triggers, lecturas y dos
correcciones, `20261009`–`20261015`). Como nunca corrieron en producción
(verificado: 0 tablas, 0 funciones, 0 triggers del frente 2), se consolidaron en
una sola `20261009`, excepción a la regla append-only de la decisión 005, que
protege lo ya aplicado ahí. La equivalencia se comprobó contra la base de test:
21 de 21 funciones idénticas al archivo (cuerpo sin comentarios), 103 objetos y
13,193 filas iguales.

## Cuándo revisar

Si la mediana del p95 de periodo, resumen o avisos supera 500 ms en `live`, o el
costo de las escrituras se nota en producción, el siguiente escalón son
agregados precalculados por mes y proyecto (las lecturas dejarían de recorrer
todos los conceptos del año).
