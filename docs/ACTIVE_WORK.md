# Trabajo activo

**Última actualización:** 2026-10-10 (cierre) — **#140 «Cuenta de proyecto clara» lanzado a producción** (PR [#142](https://github.com/EduardoTerwogt/serenata-erp/pull/142), merge `56d520a`; deploy de Vercel `READY`).
Antes (2026-10-09): #110 lanzado (PR #136) y CI afinado (#138, #139).

## Estado

**`main` = `56d520a`** (+ el commit de este cierre, solo `.md`). Producción corre en la base `ytlyphlgyhgztkfxwojt` (`us-east-2`) con Vercel en `cle1` (#124); el código en producción es el de `56d520a`
(`serenata-erp.vercel.app`). La base de producción tiene aplicadas **`20261030`–`20261042`** y está verificada; sigue sin datos de negocio reales (solo `usuarios`, catálogos y un proyecto de prueba;
la constancia fiscal de Serenata ya está subida). **No hay iniciativa activa** (`docs/PLAN.md` vacío).

**Cola de iniciativas:** **#125** (llaves de Supabase legacy; prioridad baja, revisión 2026-11-01, límite 2026-12-01) y **#143** (montos a proveedor antes de factura; equipo propio vs. pendiente de costo; sin arrancar).
Aparte: #119 (alta mínima de cotizaciones, falta tu decisión) y #101 (diseño de Proyectos, sin arrancar).

## Completado en esta sesión (2026-10-10, #140)

- **B0** `round2` devuelve 0 para |x| < 0.005 (cierra el «Ajuste −$9.09», que era notación científica de `toString()`).
- **B1 (`20261042`)** `cuentas_periodo`: `cierre` gana `sat_total` y `cuadre_diferencia` (cobros − pagos − SAT − utilidad; 0 = cuadra) y la retención de IVA de un grupo con factura real es el residuo del Total del CFDI si cae
  dentro de tolerancia (`max(0.01, 0.03 % neto) + 0.03`); `cuentas_cierre_mensual` ya no genera filas `isr` ni `proveedores`. Solo `CREATE OR REPLACE`. Motor de pruebas, tipos y `scripts/db/cuenta-proyecto-prueba.sql` al día.
- **B2** `POST /api/cuentas/proveedores/asignar` sobre `preparar_grupo_factura_proveedor` (schema `ProveedorNuevoSchema` extraído y compartido con facturas).
- **B3** `ProyectoResumen` (veredicto, franja del cliente, tres sobres, «Detalle para contabilidad» **debajo de Salidas**); «~» en lo aproximado; se borran `Metricas`, `Cierre` y el modo `compacto`.
- **B4** «Siguiente paso» como botón (`CuentasApp.abrirPaso`) y pop up `AsignarProveedor`; «Subir factura» como rótulo de `emitir_factura`. Ajustes pedidos en revisión: «El cliente ha pagado: $X».
- **B5** ADR 026, `ARCHITECTURE.md`, `TESTING.md`, `ROADMAP.md`; issue derivado #143; plan archivado en `docs/archive/cuenta-proyecto-clara-140.md`.
- **Producción, antes del merge** (por MCP, sin `DROP`/`DELETE`): `cuentas_cierre_mensual` completa y `cuentas_periodo` con bloque `DO` (`pg_get_functiondef` + `replace`); `md5(prosrc)` = archivo (`f2f58763…` y `9273abcb…`), ACL solo
  `postgres`/`service_role`, `proconfig` igual, `auditar_consistencia()` = 0 con 27 guardas. En test se aplicó igual.

## Decisiones nuevas

- `docs/decisions/026`: una utilidad antes de ISR, tres sobres, ISR solo como referencia, «~» para lo aproximado, residuo del CFDI para la retención real, «Siguiente paso» como botón, asignar proveedor sin factura.
- Producto: no se avisa de renglones sin costo (equipo propio = ingreso íntegro); se resuelve en #143. «Libre para usar» se conserva. El monto vive en `cuentas_pagar.costo_total` / `cuentas_pagar_grupos.monto_total`.

## Tests ejecutados (resultado real)

- Local: `tsc` limpio, lint sin errores, **1,362 pruebas unitarias**, build, E2E `cuentas-*` (72 pasan, 2 omitidas); `cuenta-proyecto-prueba.sql` completo; golden de lecturas de Cuentas idéntico salvo `cierre`/`cierre_mensual` del
  proyecto seleccionado (comparado con JSON normalizado en 38 proyectos de la fixture); BD limpia reconstruida desde las 154 migraciones.
- **PR #142 en `2f0fee8`:** `test`, `fresh-db` (incluye `plpgsql_check`), `smoke-and-critical` y `live` verdes. **`main` en `56d520a`:** `Migrations`, `Test Suite` y `E2E` (smoke, critical y `live`) verdes; `live` falló una vez por `57014` y pasó al reintentar.
- Corridas rojas intermedias del PR, ya resueltas: `cuentas-reabrir` (cambié sin querer «Cuentas reabiertas manualmente»; restaurado en `0dcd96a`) y una de `cuentas-acciones.spec.ts:238` (constancia del cliente, chromium) que pasó en otra corrida del mismo commit.
- **No se verificó desde la sesión:** el cron `keep-alive` real en producción, `scripts/loadtest/k6/cuentas.js` contra un deploy, ni una cuenta de proyecto real en `serenata-erp.vercel.app` (sin salida de red a `*.vercel.app`; el Preview sí lo revisó el usuario).

## Problemas abiertos

- **`57014` en el job `live`** (`cuentas-paridad-sql`: «proyecto seleccionado» el 2026-10-09 y «resumen y avisos» en `main` el 2026-10-10; pasa al reintentar). Una llamada a `cuentas_periodo` tarda ~0.8 s en reposo en la base de test
  (2,703 proyectos) pero `pg_stat_statements` en CI da media 1.9 s y máximo ~8 s (el `statement_timeout` de PostgREST); la base free se atasca a ratos. Causa del atasco sin probar. Si reaparece: medir con
  `EXPLAIN (ANALYZE, BUFFERS)` por llamada durante un CI o pasar la paridad a corrida nocturna. Flakes sueltos: `cuentas-principal.spec.ts:45` (móvil), `cuentas-acciones.spec.ts:238` (chromium), un test de Cotizaciones bajo carga.
- **Régimen fiscal de lo resuelto pero no archivado** (primeros 190 días): sigue el régimen actual del proveedor (ADR 025).
- **Retención de IVA con CFDI de un proveedor moral:** si el Total difiere por centavos dentro de tolerancia, el residuo queda como retención de ±0.01–0.03 (cuadra, pero no es 0). Benigno; revisar si molesta en pantalla.
- `cuentas_periodo` en la base de **test** difiere del archivo solo en comentarios (md5 distinto; misma lógica); producción coincide con el archivo.
- Un error aislado de Realtime (`no partition of relation "messages"`) el 2026-10-06 00:50 UTC: confirmar que las particiones diarias se siguen creando.
- **Historial de migraciones de producción:** con nombres por partes y sin entradas para lo corrido a mano o por `execute_sql` (incluidas `20261039`–`20261042`). Es cosmético; el estado real se verifica con `md5(prosrc)` contra los archivos.
- Un PDF real de más de ~4 MB no cabe en Subir factura (límite de Vercel); la salida es «Subir archivo» desde el detalle (decisión 024).

## Trampas operativas

- **El MCP de Supabase retiene todo SQL con `DELETE`/`DROP`** esperando una confirmación que nadie ve y **expira a los 60 s sin error**: ese SQL lo corre una persona en el SQL Editor.
  Lo grande se aplica por MCP en partes y se verifica con `md5(prosrc)`; el `success` no prueba nada. Para parchar una función ya aplicada, un bloque `DO` que lea
  `pg_get_functiondef`, reemplace y haga `EXECUTE` evita pegar 30 KB. Detalle en `.claude/rules/migraciones.md`.
- Un comentario partido distinto cambia el md5 de `prosrc`: pegar el cuerpo exacto del archivo (o comparar con comentarios y espacios normalizados).
- Todo lector nuevo de `archivo_url` debe tratar el valor `pendiente:*` (decisión 024). Drive no está configurado en Preview: ahí siempre se ve «Archivo pendiente».
- La base local de validación (Postgres 16) no sobrevive a la sesión: `scripts/db/local-up.sh [bd]` la reconstruye en ~10 s; el generador y el medidor están en `scripts/db/escala-*.sql`.
- Para correr Playwright local: los navegadores del contenedor son `chromium-1194` y el repo pide otra versión; usar una config local con
  `launchOptions.executablePath` (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) y las variables de `smoke-and-critical` (`PLAYWRIGHT_E2E_BYPASS=true`, etc.).
- Desde la sesión de Claude no hay salida de red a `*.supabase.co` ni `*.vercel.app` (proxy): verificar por MCP o Actions.
- El hook `pre-push-gate.mjs` pausa el primer push a `main` de cada sesión (pide confirmar con el usuario).

## Pendiente del usuario

0. **Comprobar el filtro de #139:** el push de cierre de esta sesión es solo `.md`; no debe crear corridas de `E2E`, `Test Suite` ni `Migrations` (si crea alguna, revisar el `paths-ignore`).
1. **#110:** correr `scripts/loadtest/k6/cuentas.js` (`VUS=5`) contra un deploy real y revisar `Server-Timing` de `periodo`; confirmar que el cron `keep-alive` responde 200 con `archivado.ok`;
   tomar un respaldo manual antes de que haya datos reales que archivar (ADR 020, plan Free sin respaldos).
2. **#140:** abrir en producción una cuenta de proyecto real y correr `auditar_consistencia()` en Admin tras la primera factura/pago reales (mirar `cuadre_diferencia` en el detalle contable).
3. Decidir #119 (alta mínima de cotizaciones). Opcional: borrar ramas ya fusionadas (`claude/ajustes-131`, `claude/admiring-faraday-i5w9yj`, `claude/practical-hypatia-gc37j4`, `claude/hopeful-mayer-c7i4ft`).

## Siguiente paso

1. Verificar #110 y #140 en producción (puntos 1 y 2 de arriba).
2. **#125** (revisión 2026-11-01); #119 y #101 esperan decisión tuya; **#143** (montos a proveedor antes de factura) sin arrancar: definir primero la lista de equipos propios.
3. Opcional: borrar `.github/workflows/db-push-una-vez.yml` (workflow de un solo uso de #124 contra la base nueva; ya no tiene su secreto `PROD_NUEVA_DB_URL`).
4. Opcionales sin fecha: parcialidad y saldo insoluto del complemento (exige ampliar el parser); corregir un descuadre ligando o desligando cotizaciones sin
   resubir la factura (exige ampliar el CHECK de `cuentas_correcciones`); cancelar una cotización aprobada con factura o cobros, con traspaso (`docs/ROADMAP.md` → "Después").

## Deuda técnica

- **Doble TS de Cuentas** (`tests/support/cuentas-motor`, ~2,150 líneas, solo pruebas): segunda implementación de las reglas que alimenta los datos simulados de `critical` y la paridad de `live` (6 pruebas, ~18 % del tiempo de `live`).
  #140 la tocó de nuevo (retención real, `sat_total`, `cuadre_diferencia`). Candidato a plan aparte: reemplazar la paridad por la equivalencia `scripts/db/cuentas-equivalencia.sql` y los simulados por fixtures fijos.
- **Sin vigilancia de producción:** nadie comprueba que el cron `keep-alive` responda 200 con `archivado.ok` ni que `auditar_consistencia()` siga en 0. Bastaría un workflow diario con un `curl` (requiere `CRON_SECRET` en los secretos de GitHub).
- **Llaves legacy de Supabase** (#125): límite interno 2026-12-01.
- **`cuentas_por_proyecto(p_year, p_proyecto)`:** `p_proyecto` ya no se usa; quitarlo en la próxima migración que toque esa función (DROP + CREATE manual).
- **`realtime-js` fijo en 2.112.0** (la guarda `lib/realtime/__tests__/realtime-js-guard.test.ts` falla si se sube sin pasar el JWT por `accessToken`).
- **Sin respaldos en el plan Free** (ADR 020): con datos reales, respaldo manual antes de cualquier migración con `DROP`.
- La fecha de entrega de un histórico sigue editable desde Proyectos hasta que se defina ese módulo (ADR 025).
- `DESIGN_SYSTEM.md` describe un tema oscuro y `#FF5A1A` que ya no existen.
- Los PDFs (`cotizacion-pdf*.ts`, `orden-pago-pdf.ts`, `hoja-llamado-pdf.ts`) siguen con "Serenata House Entertainment" fijo: podrían leer la razón social de `datos_fiscales_serenata`.
- `rfc` entró en `PROVEEDOR_PUBLIC_COLUMNS` (desvío consciente de T8).
