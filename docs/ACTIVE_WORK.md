# Trabajo activo

**Última actualización:** 2026-09-19

## Estado

**`docs/PLAN.md` — Borrador (agrupación de "Sueltos" post-PR #76).** En esta
misma sesión, tras cerrar la iniciativa de 6 bloques (Plantillas,
Cotizaciones UI+fórmula, Portal, Clientes, PDF de orden de pago — historia:
[`docs/archive/plantillas-cotizaciones-portal-clientes-pdf-orden-pago.md`](archive/plantillas-cotizaciones-portal-clientes-pdf-orden-pago.md),
resumen en `docs/ROADMAP.md` → "Cerrado"), se agruparon 4 de los 5 "Sueltos"
en una nueva iniciativa: Portal (simulador de factura), Cuentas (dropdown de
impuestos/utilidad de proyecto), Clientes (`cliente_id` FK) y Cuentas
(filtro de estado en vista principal). Lógica de negocio y UI ya validadas
con un simulador y 2 mockups interactivos (links en `docs/PLAN.md`). El
suelto de Dashboard quedó explícitamente fuera, en `docs/ROADMAP.md` →
"Después". Detalle completo, orden de ejecución, riesgos y validación:
`docs/PLAN.md`.

**Engineering Hardening (EF-1+EF-2+EF-3)** y **Agrupar Cuentas por Pagar por
proveedor+proyecto** siguen cerrados de sesiones anteriores — sin cambios,
ver `docs/ROADMAP.md` → "Cerrado" para el historial completo de ambas.

## Completado en esta sesión (2026-09-18/19)

**PR [#76](https://github.com/EduardoTerwogt/serenata-erp/pull/76) — los 6
bloques de `docs/PLAN.md` mergeados a `main`** (commit `2689963`, en una sola
rama/PR por desviación autorizada del usuario, cada bloque en su propio
commit):

- **Bloque 1 — Plantillas: header de tarjeta.** Precio total + utilidad
  (solo si todos los items tienen costo conocido), `lib/service-templates/calculations.ts` nuevo.
- **Bloque 2 — Cotizaciones: UI de edición.** Alineación de Datos Generales
  (Cliente/Proyecto/Fecha de Entrega/Locación izquierda, Fecha de Cotización
  derecha), `$` en inputs de dinero, botón "Vista previa" de PDF, notas
  visibles en el PDF (`notas_pdf`, campo nuevo separado de `notas_internas`,
  soportado ahora en creación Y edición — antes solo en el `PATCH` dedicado),
  botón "crear plantilla", modal de "Nota de evento". Ronda adicional pedida
  por el usuario tras revisar: paridad completa Nueva/Editar (Vista previa,
  Nota de evento y Crear plantilla faltaban en `cotizaciones/nueva`);
  unificación de todos los botones de la app al primitivo `Button`
  (`variant`/`size`, antes mezclaban tamaños); `Select` para "Plantilla de
  servicios…" (antes más alto que sus botones hermanos); `DateField` con
  placeholder alineado a la izquierda y en gris tenue (antes centrado y
  oscuro, por ser un `<button>` sin estilos de `::placeholder`); remoción
  completa de la columna "Costo + IVA" de Partidas (desktop, mobile,
  fullscreen) — no solo hacerla accesible con scroll, que fue mi primera
  interpretación equivocada del pedido; corregido tras que el usuario
  aclarara explícitamente que no la quiere visible en ningún lado de
  Partidas. `calculateCostoConIva` eliminado de `lib/quotations/calculations.ts`
  (sin relación con `calculateEstimatedTaxes`/IVA pagado, que sigue intacto).
- **Bloque 3 — Cotizaciones: fórmula Costo Unitario/Costo Total (alto
  riesgo).** `approve_cotizacion`/`patch_item_cotizacion` corregidas para
  multiplicar por `cantidad`; `normalizeQuotationItem` centraliza
  `costo_total`; matriz de casos y auditoría semántica de cierre completas
  (ver `docs/archive/.../plantillas-cotizaciones-portal-clientes-pdf-orden-pago.md`
  para el detalle punto por punto).
- **Bloque 4 — Portal.** Columna `alias` separada de `nombre` en
  `proveedores` (migración aditiva, `nombre` sin tocar); ver documentos ya
  subidos; "Tus cuentas con Serenata" migrado a tab "Historial".
- **Bloque 5 — Clientes: catálogo editable.** `PUT`/`GET` por id, mismo
  patrón `activo` (soft-delete) que Proveedores; `app/clientes/` (lista +
  modal), sin FK real todavía (`cliente` sigue denormalizado como texto).
- **Bloque 6 — Cuentas: rediseño del PDF de orden de pago.** Logo vía
  `pdf-base-config.ts`, alineado con los otros 3 generadores.

**Cierre de la iniciativa:** `docs/PLAN.md` archivado a
`docs/archive/plantillas-cotizaciones-portal-clientes-pdf-orden-pago.md`,
resumen agregado a `docs/ROADMAP.md` → "Cerrado", sección "Siguiente"/"Después"
actualizadas para reflejar qué quedó hecho vs. qué sigue como "Sueltos"
(dropdown de impuestos/utilidad de proyecto, historial de cuentas por
mes/año, calculadora de régimen fiscal, estado de resultados/balance,
`cliente_id` como FK real — este último, candidato nuevo detectado al cerrar
el Bloque 5), `docs/PLAN.md` recreado vacío. `ARCHITECTURE.md` actualizado:
fila nueva de Clientes en "Módulos y cobertura", fila de Portal ampliada con
alias/documentos/historial.

**CI de PR #76:** todas las suites en verde antes de mergear
(`tsc`/`lint`/`vitest`/`smoke`/`critical`/`fresh-db`/`live`, Preview de
Vercel desplegando bien) — un fallo de `fresh-db` por rate limit de la API
de GitHub al resolver la última release del Supabase CLI (externo, no del
diff) se reintentó una vez y pasó, mismo patrón ya visto antes.

**Después de mergear a `main`:** el mismo fallo externo de `fresh-db`
(rate limit del Supabase CLI) volvió a aparecer en el push de merge a
`main` — reintentado una vez, en verde en el segundo intento.

## Decisiones tomadas en esta sesión

- **"Costo + IVA" no vuelve a aparecer en ningún lado de Partidas** (desktop,
  mobile, fullscreen) — decisión explícita del usuario tras corregir mi
  primera interpretación ("dejarla accesible con scroll" no era lo pedido).
  No alimenta ningún otro cálculo (`calculateEstimatedTaxes`/IVA pagado usa
  su propia fórmula sobre `costo_total`, no depende de la función eliminada).
- **Todos los botones de la app pasan por el primitivo `Button`** —
  unificación pedida explícitamente por inconsistencia visual entre
  pantallas.
- **Investigar pero no arreglar** la aparente pérdida de la colaboración en
  tiempo real (ver "Problemas abiertos" abajo) — instrucción explícita del
  usuario, standing hasta que pida lo contrario.

## Tests ejecutados y resultado real

`tsc --noEmit` limpio, `lint` sin errores nuevos, `vitest` en verde en cada
punto de verificación de los 6 bloques (2 tests removidos junto con
`calculateCostoConIva`, sin reemplazo porque la función ya no existe).
`test:e2e:smoke`/`test:e2e:critical`/`live` en verde en el PR antes de
mergear. CI de `main` post-merge: `fresh-db` en verde tras un reintento
(rate limit externo, no relacionado al diff).

## Problemas encontrados que siguen abiertos

- **Colaboración en tiempo real (Presence) parece no funcionar en Preview —
  solo diagnosticado, NO arreglado (instrucción explícita del usuario).**
  El usuario abrió 2 sesiones y no vio ninguna señal de presencia. Cero
  commits de este PR tocaron `hooks/useQuotationPresence.ts`,
  `lib/realtime/*` ni `app/api/realtime/token/route.ts`, y el suite `live`
  que prueba exactamente esto pasó en cada commit — descarta una regresión
  de código introducida en esta sesión. Hipótesis más probable, sin
  confirmar (no se pudo verificar desde este entorno: egress a
  `*.vercel.app` bloqueado en el sandbox): `SUPABASE_JWT_SECRET` con
  alcance de Vercel distinto entre "Production" y "Preview" — ya estaba
  anotado como pendiente de investigar en una sesión anterior (ver debajo,
  ahora con una hipótesis concreta de por qué importa: `app/api/realtime/token/route.ts`
  responde 500 "Realtime no configurado" si el secreto falta en el
  ambiente que sirve el request). Verificación pendiente y barata: revisar
  Vercel → Settings → Environment Variables → confirmar que
  `SUPABASE_JWT_SECRET` tiene el scope "Preview" marcado, o probar
  colaboración directo contra Production. No tocar el código de Presence
  sin que el usuario lo pida explícitamente.

## Deuda técnica

- **Nueva: `app/clientes/` (Bloque 5) sin cobertura e2e.** Solo tiene test
  de la ruta API (`app/api/__tests__/clientes-route.test.ts`); no hay
  `tests/e2e/critical/clientes.spec.ts` equivalente al de Proveedores.
  Riesgo bajo (mismo patrón ya probado en Proveedores), pero es un gap real.
- **`SUPABASE_JWT_SECRET` con valores distintos entre "Production" y
  "Preview" en Vercel** — ahora con sospecha concreta de impacto (ver
  "Problemas abiertos" arriba). Verificar el scope antes de descartar esta
  entrada. (Arrastrado, ahora con contexto nuevo.)
- **Pendiente, requiere decisión de arquitectura:** el job `tracker-lint`
  de `.github/workflows/test.yml` seguía validando los 40 bloques de EF-3;
  con `docs/PLAN.md` vacío ahora mismo, no hay ningún tracker activo que
  validar hasta la próxima iniciativa — generalizarlo sigue pendiente,
  mismo alcance que antes. (Arrastrado.)
- **Verificación completa de Google OAuth (fuera de modo Prueba) sigue
  pendiente.** (Arrastrado.)
- **No se pudo confirmar con certeza cuál cuenta de test es
  `PLAYWRIGHT_TEST_EMAIL` exacta.** (Arrastrado.)
- **`AUTH_SECRET`/`NEXTAUTH_SECRET` coexistiendo en Vercel producción** —
  sin tocar, solo anotado. (Arrastrado.)

## Pendiente de limpieza manual (no bloquea nada)

- Ramas remotas de sesiones anteriores ya mergeadas o throwaway
  (`claude/ef3e1-baseline-tmp`, `fix/totales-general-conflict-drain`,
  `claude/epic-davinci-1fj7ki`, `claude/fix-approve-cotizacion-proyecto-id`)
  siguen sin borrar por el bloqueo de policy del proxy de egress contra la
  API de GitHub (`403` en `git push --delete`/`DELETE` directo). Borrar
  desde la UI de GitHub cuando se quiera, sin urgencia. (Arrastrado.)

## Siguiente paso

**`docs/PLAN.md` en Borrador, listo para pasar a Aprobado.** Orden de
ejecución decidido: (1) Portal — simulador de factura, (2) Cuentas —
dropdown de impuestos y utilidad de proyecto, (3) Clientes — `cliente_id`
como FK real, (4) Cuentas — filtro de estado en vista principal (el único
sin diseño cerrado; se termina de definir al abrir ese bloque). Una sesión
futura confirma el plan como "Aprobado, listo para ejecutar" y arranca por
el bloque 1. Si el usuario confirma la hipótesis de `SUPABASE_JWT_SECRET`
en Preview, ese es un fix puntual de una sola sesión (no una iniciativa),
fuera de `docs/PLAN.md`.
