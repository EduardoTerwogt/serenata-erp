# Estado real del proyecto

**Última actualización:** 2026-09-09 · `main` en `3d18c6c`

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

**Suites en verde hoy:** 351 unit (Vitest, 45 archivos) y 66 e2e mockeados
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

## 3. Features parciales — preguntar antes de tocar

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

## 4. Deuda conocida

- Las migraciones se aplican **a mano** en el SQL Editor de Supabase; no hay CLI ni
  aplicación automática. `npm run check-migrations` solo lista y valida nombres.
- `RLS` está habilitado en las tablas pero **sin políticas**, así que la llave
  anónima no puede leer nada. Es la razón de que la colaboración no use
  `postgres_changes` (suscribirse desde el navegador exigiría exponer todas las
  cotizaciones a la llave pública).
- `lib/db.ts` es solo una fachada de compatibilidad que reexporta los repositorios.
  No volver a meterle lógica.
