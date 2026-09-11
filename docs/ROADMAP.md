# Roadmap

**Última actualización:** 2026-09-11

Dirección general del producto. Responde **¿hacia dónde vamos?** — no es el prompt
de una sesión de trabajo. Para lo que se está construyendo ahora,
`docs/ACTIVE_WORK.md`.

---

## Cerrado

- **Colaboración en cotizaciones (Fases 0-8).** Edición simultánea con modelo
  server-authoritative, conflictos por campo, Realtime solo Presence. Arquitectura
  READY para ser reutilizada por otros módulos sin deuda bloqueante.
  Historia: `docs/archive/fases-colaboracion-0-8.md`.

## Siguiente

_(pendiente de priorizar con Eduardo)_

## Features a medias

Están construidos parcialmente **a propósito**. No "arreglarlos" de paso sin
confirmar: cerrarlos es una iniciativa con alcance propio, no un fix incidental.

- **Google Calendar desde Proyectos** — la UI existe, el flujo end-to-end no cierra.
  En Planeación sí funciona; no asumir que es lo mismo.
- **Complementos de pago (CFDI)** — se suben y se registran, pero el XML no se parsea
  y la conciliación automática contra cuentas por cobrar no está hecha.
- **Órdenes de pago** — el CRUD y el PDF funcionan; los flujos de aprobación y firma
  no existen.
- **Plantillas de servicios** — completas para cotizaciones nuevas; la integración con
  cotizaciones COMPLEMENTARIA es parcial.
- **Rediseño visual (Fase 5.7)** — casi toda la app usa los tokens `--sn-*`. Siguen en
  estilo viejo: `app/login/page.tsx`, `app/admin/sheets/page.tsx` y los primitivos
  `components/ui/*` + `app/components/ui/Skeleton*`. Ver `DESIGN_SYSTEM.md`.

Si aparece otro feature a medias, documentarlo aquí.

## Otros candidatos

Sin orden asignado todavía:

- **Colaboración en Proyectos** — segundo consumidor de `useRealtimeChannel`. Es lo
  que la Fase 8 dejó habilitado, y el que definiría si el protocolo
  `base`/`mutation_id`/conflict se generaliza o se queda específico de Cotizaciones
  (deuda intencional, ver decisión 003).
- **Editor visual de plantillas de PDF** — hoy todo PDF se genera por código
  (`lib/server/pdf/`); cualquier ajuste de formato requiere tocar código.
- **Rate limiting a un store dedicado** — hoy corre sobre Postgres (no hay cuenta de
  pago de Vercel). Funciona al volumen actual; migrar a Upstash o Vercel KV si el
  tráfico del portal crece. La interfaz `checkRateLimit()` ya está aislada para que
  ese cambio no toque los callers.

---

## Cómo se mantiene

Una iniciativa entra a **Siguiente** cuando se prioriza, pasa a `ACTIVE_WORK.md`
cuando arranca, y vuelve aquí como **Cerrado** cuando termina. Si generó una
bitácora larga, esa bitácora se archiva — no se queda en los documentos vivos.
