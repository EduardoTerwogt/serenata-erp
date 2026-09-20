# Trabajo activo

**Última actualización:** 2026-09-20

## Estado

**`docs/PLAN.md` — Aprobado, en ejecución.** Bloque 1 (Portal: simulador de
factura) cerrado esta sesión — PR [#77](https://github.com/EduardoTerwogt/serenata-erp/pull/77),
mergeado a `main` en `647686b`. Bloque 2 (Cuentas: dropdown de impuestos y
utilidad de proyecto) es el siguiente a ejecutar — lógica de negocio y
mockup ya validados en sesión anterior, sin código todavía. Detalle
completo, orden de ejecución, riesgos y validación de los 4 bloques:
`docs/PLAN.md`.

**Engineering Hardening (EF-1+EF-2+EF-3)** y **Agrupar Cuentas por Pagar por
proveedor+proyecto** siguen cerrados de sesiones anteriores — sin cambios,
ver `docs/ROADMAP.md` → "Cerrado" para el historial completo de ambas.

## Completado en esta sesión (2026-09-19/20)

**Bloque 1 completo — PR [#77](https://github.com/EduardoTerwogt/serenata-erp/pull/77)
mergeado a `main` (commit `647686b`).** El PR [#78](https://github.com/EduardoTerwogt/serenata-erp/pull/78)
(hotfix del parser XML) se cerró sin mergear por separado — sus 4 commits
ya estaban cherry-pickeados dentro de #77, verificado con `git diff` entre
ambas ramas antes de cerrar (sin ningún cambio exclusivo de #78 ausente en
#77).

### Simulador de factura (alcance original del bloque)

- Mensaje genérico (sin exponer el monto esperado de Serenata) cuando el
  mismatch es de **subtotal**; mensaje específico + bloque de ejemplo
  cuando es de **desglose** (IVA/retenciones) — wrapper nuevo
  `lib/server/portal/factura-mensaje-proveedor.ts`, sin tocar
  `validarFacturaFiscalProveedor()` (sigue siendo la fuente de verdad para
  staff).
- Panel "Simulador de factura" en `TabCuentas`: se autollena con
  `calcularEjemploFactura()` (movida a `lib/shared/factura-fiscal.ts`,
  módulo puro) al elegir proyecto — el proveedor nunca escribe un monto a
  mano.

### Cierre real del bloque (pruebas manuales del usuario sobre el Preview)

- Fix de refresco: tras subir una factura con éxito, la cuenta ya no sigue
  seleccionable y aparece de inmediato en el historial como `FACTURADO`.
- "Historial" deja de ser tab propio: tabla paginada (10/página, mismo
  patrón que `cotizaciones`) al fondo de "Cuentas y facturas".
- Portal completo (login, signup, confirmar identidad, Mis datos,
  Documentación, Cuentas y facturas) migrado a los primitivos
  `TextField`/`Button`/`Select`/`Modal` — antes tenía `<input>`/`<button>`
  crudos que no respetaban el design system.
- Proporciones de los campos de archivo corregidas (el "Choose file" nativo
  del navegador no cabía en el control de 32px de `TextField`).

### 3 bugs reales de validación fiscal (parser XML → parser real)

Encontrados probando con facturas reales de distintos proveedores
(cotizaciones SH076/SH077), corregidos en `lib/server/xml/factura-parser.ts`:

1. **Duplicación de IVA trasladado/retenciones** — `parseFacturaXML()`
   sumaba por regex sobre el XML completo sin distinguir nivel; un CFDI
   real trae `Traslado`/`Retencion` una vez por `Concepto` y otra a nivel
   `Comprobante`. Fix definitivo: se reemplazó la extracción por regex por
   un parser XML real (`fast-xml-parser`) — el bug queda eliminado por
   construcción, no por una regla de scoping de texto.
2. **`Folio` exigido cuando es opcional en el XSD del SAT** — rechazaba
   facturas válidas y timbradas sin ese atributo.
3. **Tolerancia de redondeo en retención de IVA** — 2/3×16% es un decimal
   periódico; distintos PACs redondean distinto. Tolerancia proporcional al
   subtotal (0.03%), solo en `iva_retenido` (ISR sigue exacto al centavo).

Gotcha completo documentado en `ARCHITECTURE.md` → "Gotchas del repo".

### 3 bugs reales más en Documentación del Portal (segunda ronda de pruebas)

Documentados a fondo en `docs/decisions/013-portal-documentos-verdad-unica.md`:

1. **Matching de identidad solo por INE.** Subir la constancia ya no
   dispara `buscarCandidatosMatch()` — hay proveedores que facturan por
   terceros, y el nombre de la constancia no es el del colaborador real.
2. **`estado_validacion` de documentos, auto-clasificación híbrida**
   (decisión del usuario entre 4 opciones ofrecidas). INE/constancia
   legibles → `validado`; ilegibles → `revision` con motivo (misma IA que
   ya corre para matching/régimen). Comprobante de domicilio/bancario
   quedan `pendiente` hasta revisión manual. Nueva sección "Documentos" en
   `ProveedorModal.tsx` (staff): botones Validar / Marcar en revisión.
   Migración `20260919_proveedor_documentos_detalle_validacion` (columna
   `detalle_validacion`), aplicada y verificada en `serenata-erp-test` y
   producción.
3. **Cada tipo de documento (constancia, INE, comprobante de domicilio,
   comprobante bancario) es de "verdad única".** Subir uno nuevo borra el
   anterior del mismo tipo (documento + archivo en Drive, best-effort).
   Empezó acotado a la constancia (el régimen fiscal no se actualizaba con
   una constancia nueva — guard `!proveedorActual?.regimen_fiscal`
   quitado, ahora siempre pisa) y se generalizó a los otros 3 tipos por
   pedido explícito del usuario tras confirmar que la constancia quedó
   bien.

### Otros fixes de UX del Portal (rondas de revisión manual)

- Botón de borrar por documento en "Documentación" (oculto si ya está
  `validado`), con modal de confirmación — antes solo dejaba "Subir otro".
- Botón de borrar reposicionado al extremo derecho de la fila (quedaba en
  medio, entre el badge de estado y "Subir otro").
- Placeholder de Alias simplificado a "nickname".
- Mensaje de régimen fiscal sin detectar: "Pendiente de subir constancia
  fiscal, sube desde la sección Documentación" (antes un texto genérico
  que no distinguía si ya se había subido algo).

## Decisiones tomadas en esta sesión

- **Identidad del Portal se valida solo con INE, nunca con la constancia**
  — ver `docs/decisions/013-portal-documentos-verdad-unica.md`.
- **`regimen_fiscal` siempre refleja la última constancia subida, sin
  excepción** — reversa explícita de la regla anterior ("nunca pisar lo
  que staff corrigió a mano"). Decisión del usuario: la constancia manda.
- **`estado_validacion` se resuelve híbrido** (auto-clasificación por IA +
  corrección manual de staff) — elegido explícitamente por el usuario
  entre 4 opciones ofrecidas (auto puro, manual puro, híbrido, dejarlo sin
  resolver).
- **Reemplazo automático al subir un documento nuevo aplica a los 4
  tipos** (constancia, INE, comprobante de domicilio, comprobante
  bancario), no solo a la constancia — generalización pedida explícitamente
  tras validar el comportamiento con la constancia.
- **PR #78 se cierra sin mergear** — su contenido completo ya estaba
  incluido en PR #77 vía cherry-pick; mergear ambos habría sido redundante
  y arriesgaba un merge confuso sobre el mismo código.

## Tests ejecutados y resultado real

`tsc --noEmit` limpio, `lint` sin errores nuevos (8 warnings preexistentes,
sin relación con el diff) en cada punto de verificación. `vitest`: 947/947
en verde en el último commit antes de mergear. CI del PR #77 en verde
(`tracker-lint`/`test`/`smoke-and-critical`/`fresh-db`/`live`) antes de
mergear, en el commit `2a9b5e0`. Migración `20260919_proveedor_documentos_detalle_validacion`
aplicada y verificada con `execute_sql` en `serenata-erp-test`
(`ozrtsludmcguvgqdjicn`) y producción (`fwmyoqokcjtldiofuxdg`).

e2e nuevos/actualizados esta sesión: `smoke/portal-documentos.spec.ts`
(nuevo, borrado de documentos), `smoke/portal-mis-datos.spec.ts` (nuevo,
mensaje de régimen fiscal), `critical/portal-factura.spec.ts` (limpieza de
archivos tras éxito, paginación del historial, mismatches de
subtotal/desglose/régimen, simulador).

## Problemas encontrados que siguen abiertos

Ninguno nuevo de esta sesión. Los heredados de la sesión anterior (Presence
en Preview, `SUPABASE_JWT_SECRET` por ambiente) siguen sin tocar — ver
`docs/archive/` si hace falta el detalle histórico.

## Deuda técnica

- **Documentos duplicados que ya existían en producción antes de este fix
  no se limpiaron retroactivamente.** El reemplazo "verdad única" es
  *lazy*: se dispara recién la próxima vez que ese proveedor suba un
  documento de ese tipo. Si se quiere una base ya limpia sin esperar,
  hace falta un backfill one-off (borrar duplicados existentes,
  quedándose con el más reciente por `proveedor_id`+`tipo`). Bajo riesgo,
  sin urgencia — el sistema converge solo con el uso normal.
- **`tracker-lint` de `test.yml` sigue sin generalizarse** fuera de los 40
  bloques de EF-3 — con una iniciativa nueva activa (`docs/PLAN.md`), sigue
  sin haber urgencia real de resolverlo. (Arrastrado.)
- **Verificación completa de Google OAuth (fuera de modo Prueba)** sigue
  pendiente. (Arrastrado.)
- **`AUTH_SECRET`/`NEXTAUTH_SECRET` coexistiendo en Vercel producción** —
  sin tocar, solo anotado. (Arrastrado.)
- **`SUPABASE_JWT_SECRET` con valores distintos entre "Production" y
  "Preview" en Vercel** — sospecha de sesión anterior sobre por qué
  Presence no se ve en Preview, sin verificar todavía. (Arrastrado.)

## Pendiente de limpieza manual (no bloquea nada)

- Ramas remotas ya mergeadas o cerradas sin uso
  (`fix/parse-factura-xml-iva-duplicado` recién cerrada, más las
  arrastradas de sesiones anteriores) siguen sin borrar por el bloqueo de
  policy del proxy de egress contra la API de GitHub. Borrar desde la UI
  de GitHub cuando se quiera, sin urgencia. (Arrastrado.)

## Siguiente paso

Abrir **Bloque 2 — Cuentas: dropdown de impuestos a pagar y utilidad
bruta/neta de proyecto** en una sesión futura (`/serenata-iniciar-fase`).
Lógica de negocio y fórmulas ya validadas y aprobadas en `docs/PLAN.md`
(retenciones/IVA no restan utilidad de Serenata; ISR estimado 30% sí;
vista "Cierre del proyecto"; gap de RESICO persona física ya investigado y
en alcance). Mockup de referencia confirmado, link en `docs/PLAN.md` →
"Artefactos de referencia".
