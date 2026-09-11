# Estado real del proyecto

**Última actualización:** 2026-09-11 · `main` en `fc6a113`

Foto honesta del repo: qué funciona de verdad, qué está a medias y qué se sabe
que falta. Responde una sola pregunta — **¿en qué estado está la app hoy?**

- Qué estamos construyendo ahora → `docs/ACTIVE_WORK.md`
- Hacia dónde vamos → `docs/ROADMAP.md`
- Cómo está construido → `ARCHITECTURE.md`
- Por qué se decidió así → `docs/decisions/`
- Cómo se llegó hasta aquí (Fases 0-8 de colaboración) → `docs/archive/fases-colaboracion-0-8.md`

---

## 1. Lo que está terminado y verificado

| Módulo | Estado | Evidencia |
|---|---|---|
| Cotizaciones (CRUD, folio atómico, PDF, emitir) | Funciona | `tests/e2e/critical/cotizaciones-*.spec.ts`, live `basic.spec.ts` |
| Aprobar / cancelar cotización (RPC transaccional) | Funciona | live: crear → emitir → aprobar → cuentas → cancelar y revertir |
| Cuentas por cobrar (factura, complemento, pagos parciales) | Funciona | crítico + live de concurrencia |
| Cuentas por pagar (factura, pagos, órdenes de pago con PDF real) | Funciona | `lib/server/pdf/orden-pago-pdf.ts`, live de concurrencia |
| Registrar pago sin carreras (cobrar y pagar) | Funciona | `tests/e2e/live/cuentas-*-concurrency.spec.ts` |
| Proyectos (detalle, tareas, cronograma, tipos, reporte de cierre) | Funciona | smoke de proyectos |
| Proveedores (lista + modal, historial, régimen fiscal) | Funciona | `tests/e2e/critical/proveedores.spec.ts` |
| Portal de proveedores (signup, login, confirmar identidad, subir factura) | Funciona | `smoke/portal-signup.spec.ts`, `critical/portal-factura.spec.ts` |
| Planeación (extracción AI, pendientes, soft delete) | Funciona | `critical/planeacion.spec.ts` |
| Plantillas de servicios | Funciona para cotizaciones nuevas | `critical/plantillas-servicios.spec.ts` |
| Admin de usuarios y sync a Google Sheets | Funciona | `critical/admin-usuarios.spec.ts` |
| Dashboard (incluye gastos fijos) | Funciona | `lib/server/repositories/dashboard.ts` + sus tests |

**Edición colaborativa de cotizaciones:** cerrada y en verde. Dos personas pueden
editar la misma cotización sin pisarse. La arquitectura quedó **READY para
Proyectos sin deuda bloqueante**. El modelo vigente y sus reglas están en
`docs/decisions/`; el recorrido completo, en el archivo histórico.

**Suites en verde:** unit (Vitest) y e2e mockeados (smoke + critical) corren en
cada push; `live` corre en CI contra Supabase y Drive de prueba reales. Conteos
exactos: correr las suites — no se fijan aquí para que no se desincronicen.

---

## 2. Features a medias

Están construidos parcialmente **a propósito**. No "arreglarlos" sin consultar.

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

## 3. Deuda conocida

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
