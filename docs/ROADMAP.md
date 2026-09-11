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

## Candidatos conocidos

Pendientes reales ya documentados, sin orden asignado todavía:

- **Colaboración en Proyectos** — segundo consumidor de `useRealtimeChannel`. Es lo
  que la Fase 8 dejó habilitado, y el que definiría si el protocolo
  `base`/`mutation_id`/conflict se generaliza o se queda específico de Cotizaciones
  (deuda intencional, ver decisión 003).
- **Editor visual de plantillas de PDF** — hoy todo PDF se genera por código
  (`lib/server/pdf/`); cualquier ajuste de formato requiere tocar código.
- **Conciliación automática de complementos de pago (CFDI)** — el XML se sube pero
  no se parsea ni se concilia contra cuentas por cobrar.
- **Flujos de aprobación/firma de órdenes de pago** — el CRUD y el PDF existen.
- **Google Calendar desde Proyectos** — la UI existe, el flujo end-to-end no cierra.
  En Planeación sí funciona.
- **Plantillas de servicios en cotizaciones COMPLEMENTARIA** — integración parcial.
- **Cerrar la migración visual** — `app/login`, `app/admin/sheets` y los primitivos
  `components/ui/*` siguen en el estilo viejo.
- **Rate limiting a un store dedicado** — hoy sobre Postgres; migrar si el tráfico
  del portal crece.

---

## Cómo se mantiene

Una iniciativa entra a **Siguiente** cuando se prioriza, pasa a `ACTIVE_WORK.md`
cuando arranca, y vuelve aquí como **Cerrado** cuando termina. Si generó una
bitácora larga, esa bitácora se archiva — no se queda en los documentos vivos.
