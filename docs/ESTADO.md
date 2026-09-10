# Estado real del proyecto

**Última actualización:** 2026-09-09 · `main` en `d203044`, branch `claude/eloquent-lamport-h7effg` activa

Este documento es la foto honesta del repo: qué funciona de verdad, qué está a
medias y qué está roto ahora mismo. Si vas a retomar el trabajo, léelo antes que
cualquier otra cosa.

---

## 1. Lo que está terminado y verificado

| Módulo | Estado | Evidencia |
|---|---|---|
| Cotizaciones (CRUD, folio atómico, PDF, emitir) | Funciona | `tests/e2e/critical/cotizaciones-*.spec.ts`, live `basic.spec.ts` |
| Aprobar / cancelar cotización (RPC transaccional) | Funciona | live: crear → emitir → aprobar → cuentas → cancelar y revertir |
| Cuentas por cobrar (factura, complemento, pagos parciales) | Funciona | crítico + live de concurrencia |
| Cuentas por pagar (factura, pagos, órdenes de pago con PDF real) | Funciona | `lib/server/pdf/orden-pago-pdf.ts`, live de concurrencia |
| Registrar pago sin carreras (cobrar y pagar) | Funciona | `tests/e2e/live/cuentas-*-concurrency.spec.ts` — dos pagos simultáneos: ninguno se pierde, el que excede el total se rechaza |
| Proyectos (detalle, tareas, cronograma, tipos, reporte de cierre) | Funciona | smoke de proyectos |
| Proveedores (lista + modal, historial, régimen fiscal) | Funciona | `tests/e2e/critical/proveedores.spec.ts` |
| Portal de proveedores (signup, login, confirmar identidad, subir factura) | Funciona | `smoke/portal-signup.spec.ts`, `critical/portal-factura.spec.ts` |
| Planeación (extracción AI, pendientes, soft delete) | Funciona | `critical/planeacion.spec.ts` |
| Plantillas de servicios | Funciona para cotizaciones nuevas | `critical/plantillas-servicios.spec.ts` |
| Admin de usuarios y sync a Google Sheets | Funciona | `critical/admin-usuarios.spec.ts` |
| Dashboard (incluye gastos fijos) | Funciona | `lib/server/repositories/dashboard.ts` + sus tests |

**Suites en verde hoy:** 378 unit (Vitest, 50 archivos) y 66 e2e mockeados
(smoke + critical). Ambas corren en cada push.

---

## 2. Edición colaborativa de cotizaciones — trabajo en curso

Es el frente activo. Dos personas pueden tener abierta la misma cotización
(`/cotizaciones/[id]`) y editarla a la vez.

### Cómo está construido (y por qué)

- **No hay OT ni CRDT.** No hace falta: no se edita un stream de texto compartido,
  se editan campos de un registro estructurado. El modelo es **último en escribir
  gana, por campo** (el de Figma/Linear), no el de Google Docs.
- **WebSockets sí**, vía Supabase Realtime (`hooks/useQuotationPresence.ts`): un
  canal por cotización con *presence* (quién está) y *broadcast* (avisos de "estoy
  en esta sección", "toqué esta celda", "agregué/borré una fila").
- **La convergencia NO depende de esos avisos.** Son best-effort: `channel.send()`
  cae en silencio a REST cuando el canal no está unido, eso devuelve 403 y el
  `.catch(() => null)` se lo traga. Medido, no supuesto. Por eso la pantalla
  **reconcilia contra la base** cada 5 s (`RECONCILIACION_MS` en
  `app/cotizaciones/[id]/page.tsx`), al reconectar el canal y al volver la pestaña
  a primer plano. Los avisos solo aceleran; la base es la que manda.
- **La reconciliación no pisa lo que estás escribiendo:** conserva las filas con
  edición local en curso, agrega las filas nuevas con `append` (no remonta la
  tabla) y, cuando debe reconstruir con `replace`, restaura el campo enfocado y la
  posición del cursor insistiendo unos frames.
- **Escrituras por sección**, para que dos personas en secciones distintas no se
  borren entre sí: `PATCH /api/cotizaciones/[id]/{general,totales,notas}` y
  `PATCH .../items/[itemId]`. Cada una toca solo lo suyo.
- **Los PATCH bloquean fila en Postgres** (`SELECT ... FOR UPDATE` dentro del RPC)
  y aplican **solo las claves que llegaron**, para no revivir valores viejos de un
  read-modify-write.

### Defectos de producción que este trabajo encontró y arregló

1. `save_cotizacion` **borraba y recreaba todas las partidas con ids nuevos** en
   cada guardado. Era la causa raíz de que se perdieran ediciones ajenas. Ahora
   preserva ids (`db/migrations/20260909_preservar_ids_y_guardados_por_seccion.sql`).
2. El PATCH de una partida hacía read-modify-write y **borraba el campo que el otro
   acababa de escribir**. Ahora es un RPC con bloqueo de fila
   (`db/migrations/20260909_patch_item_cotizacion_rpc.sql`).
3. La consulta de la cotización **no ordenaba las partidas** (`ORDER BY orden`), así
   que las filas se barajaban al actualizar cualquiera.

Los tres se detectaron con el nivel `live`; ningún mock los habría visto.

### Lo que falta

- **[ROJO] Un test live falla:** `cotizaciones-colaboracion.spec.ts:282` —
  *"estar en una sección la señala pero no impide que el otro escriba en ella"*.
  La aserción que falla es que a B le aparezca el aviso *"… está editando esta
  sección"* (`SectionEditBadge`, `app/cotizaciones/[id]/page.tsx:1038`). El resto
  del test (que el cambio de A llegue a B, y que B pueda guardar su propio campo)
  no llegó a evaluarse.
  **Diagnóstico pendiente, y hay que decidir entre dos lecturas:**
  a) es un defecto de producto — la señal de presencia no se emite o no llega
  (plausible: es el mismo `send()` → REST → 403 medido arriba), y entonces se
  arregla el producto; o
  b) el aviso es, por diseño, una pista best-effort que no se garantiza, y
  entonces el test debe afirmar el comportamiento sustantivo (que ambos escriban
  sin pisarse) en vez de la insignia.
  **No se vale cambiar el test solo para que pase.** Últimas corridas de CI: run
  292 → 14 pasan, 1 falla, 3 no llegan a correr.
- Verificar en local antes de pushear sigue siendo imposible sin abrir la salida de
  red a `ozrtsludmcguvgqdjicn.supabase.co` (el sandbox la tiene bloqueada). Mientras
  tanto, el ciclo es empujar y esperar ~20 min de CI, con el costo que eso tiene.

---

## 3. Rediseño de colaboración en tiempo real — Fase 0/1 en curso

Iniciativa de alto riesgo (Realtime, RPCs, seguridad, concurrencia) ejecutada
en branch dedicada `claude/eloquent-lamport-h7effg` + PR draft + Vercel
Preview, como excepción explícita aprobada a la regla de "siempre `main`" —
ver la política git de la sección "Git — setup y reglas" de `CLAUDE.md`. El
Preview de esta branch apunta al proyecto Supabase de prueba
(`serenata-erp-test`), no a producción.

### Fase 0 — Baseline (cerrada)

Batería completa corrida sobre esta branch antes de tocar nada:

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | Verde |
| `npm run lint` | Verde (0 errores, 9 warnings preexistentes) |
| `npm test` | 378/378 verde |
| `npm run build` | Verde |
| `npm run test:e2e:smoke` | 21/21 verde |
| `npm run test:e2e:critical` | 45/45 verde (incluye los 4 casos de colaboración mockeados de `cotizaciones-editar.spec.ts` vía `tests/e2e/utils/realtime-mock.ts`) |
| `npm run check-migrations` | Verde, 46 migraciones |
| `npm run test:e2e:live` | No corrible en este sandbox (sin salida de red a `ozrtsludmcguvgqdjicn.supabase.co`); se dispara vía `workflow_dispatch` del job `live` en CI |

Nota de entorno: el sandbox de código no tiene salida de red directa al
proyecto Supabase de prueba (confirmado arriba, en la sección 2), pero el
**servidor MCP de Supabase sí tiene acceso directo** a ambos proyectos
(`serenata-erp-test` y `serenata-erp`) — se usó para verificar en vivo el
estado de RLS de `realtime.messages` y para aplicar la migración de Fase 1.
Es un canal distinto del `fetch`/Playwright de la app, que sigue bloqueado.

El caso de colaboración que falla hoy en CI (documentado en la sección 2,
línea ~282 de `cotizaciones-colaboracion.spec.ts`) sigue así a propósito —
no se toca en Fase 0/1, se resuelve solo cuando el modelo de sección-lock se
retire en una fase posterior del rediseño.

Mapa de archivos de la colaboración actual (para quien retome esto):
`hooks/useQuotationPresence.ts`, `lib/supabase-browser.ts`, `lib/supabase.ts`,
`app/cotizaciones/[id]/page.tsx` (`RECONCILIACION_MS`, `reconcileServerItems`),
las 3 rutas PATCH de cotizaciones (`items/[itemId]`, `general`, `totales`) y
sus RPCs (`patch_item_cotizacion`, `patch_cotizacion_general`,
`patch_cotizacion_totales`), `tests/e2e/live/cotizaciones-colaboracion.spec.ts`,
`tests/e2e/utils/realtime-mock.ts`, `tests/e2e/utils/live-helpers.ts`.

### Fase 1 — Infraestructura Realtime segura (en curso)

Objetivo: cerrar el hueco de seguridad real — hoy cualquiera con la anon key
pública puede unirse al canal `cotizacion:*` de cualquier cotización, porque
`useQuotationPresence.ts` usa un canal público sin autenticación. No toca
todavía el protocolo de mutación (conflicto por campo, `revision` — eso es
Fase 2) ni el grid de partidas.

**Criterios de éxito, congelados por escrito:**

1. Dos clientes autorizados (sesión NextAuth real, sección `cotizaciones`)
   que se unen al mismo canal privado `cotizacion:<id>` reciben un evento de
   prueba emitido por el servidor.
2. Un cliente sin la sección `cotizaciones`, y otro con un token
   expirado/con firma inválida, NO pueden unirse.
3. Con el WebSocket completamente cortado (mismo mecanismo que el caso 8 de
   `cotizaciones-colaboracion.spec.ts`), la reconciliación de 5s converge
   exactamente igual que hoy — Fase 1 no toca ese mecanismo.

Ver el detalle de implementación en el plan de ejecución de la sesión.

**Estado:** código completo y pusheado (PR draft
[#13](https://github.com/EduardoTerwogt/serenata-erp/pull/13)). Migración de
políticas RLS aplicada y verificada en `serenata-erp-test` y `serenata-erp`.
`npx tsc --noEmit`, `npm run lint`, `npm test` (394/394) y `npm run build` en
verde.

**Pendiente — pasos manuales (le corresponden al usuario, ver CLAUDE.md):**

1. Obtener el JWT Secret legacy de `serenata-erp-test` (Dashboard → Settings
   → API) y cargarlo como `SUPABASE_JWT_SECRET` en Vercel (scope Preview) y
   como secret `TEST_SUPABASE_JWT_SECRET` en GitHub Actions (ya wireado en
   `.github/workflows/e2e.yml`, job `live`).
2. Recién con eso configurado, desactivar "Allow public access" en Realtime
   Settings de `serenata-erp-test` (solo ahí, nunca en producción todavía).
3. Disparar el job `live` (`workflow_dispatch`) y confirmar: el nuevo
   `tests/e2e/live/realtime-channel-authorization.spec.ts` en verde, y
   `cotizaciones-colaboracion.spec.ts` sigue en 8/9 (mismo caso conocido).

Sin el paso 1, `/api/realtime/token` responde 500 en producción/Preview
real (aunque en CI mockeado y en el sandbox de desarrollo no importa, ya
que ese endpoint solo se ejercita con sesión real).

---

## 4. Features parciales — preguntar antes de tocar

- **Google Calendar desde Proyectos:** la UI existe, el flujo end-to-end no está
  cerrado. En planeación sí funciona; no asumir que es lo mismo.
- **Complementos de pago (CFDI):** se suben y se registran, pero el XML no se
  parsea y la conciliación automática contra cuentas por cobrar no está hecha.
- **Órdenes de pago:** el CRUD y el PDF funcionan; flujos de aprobación/firma no
  existen.
- **Plantillas de servicios:** completas para cotizaciones nuevas; la integración
  con cotizaciones COMPLEMENTARIA es parcial.
- **Rediseño visual (Fase 5.7):** casi toda la app usa ya los tokens `--sn-*`.
  Quedan en el estilo viejo (`gray-*` de Tailwind): `app/login/page.tsx`,
  `app/admin/sheets/page.tsx` y los primitivos `components/ui/*` +
  `app/components/ui/Skeleton*`. Ver `DESIGN_SYSTEM.md`.

Si aparece otro feature a medias, documentarlo aquí en vez de "arreglarlo" sin
consultar.

---

## 5. Deuda conocida

- Las migraciones se aplican **a mano** en el SQL Editor de Supabase; no hay CLI ni
  aplicación automática. `npm run check-migrations` solo lista y valida nombres.
- `RLS` está habilitado en las tablas pero **sin políticas**, así que la llave
  anónima no puede leer nada. Es la razón de que la colaboración no use
  `postgres_changes` (suscribirse desde el navegador exigiría exponer todas las
  cotizaciones a la llave pública).
- `lib/db.ts` es solo una fachada de compatibilidad que reexporta los repositorios.
  No volver a meterle lógica.
- **Rate limiting (`lib/server/rate-limit.ts`) está implementado sobre Postgres**,
  no sobre un store dedicado (Upstash/Vercel KV) -- no hay cuenta de pago de Vercel
  hoy. Funciona bien al volumen actual (un `INSERT ... ON CONFLICT ... RETURNING`
  atómico por intento), pero cada intento de login/signup del portal le pega a la
  base. **Recomendación futura:** si el volumen de tráfico del portal crece,
  migrar a Upstash Redis o Vercel KV (latencia menor, no compite con las queries
  de negocio) -- la interfaz (`checkRateLimit(key, max, windowSeconds)`) ya está
  aislada para que ese cambio no toque los callers.
