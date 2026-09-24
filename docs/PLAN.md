# Plan de la iniciativa activa

**Iniciativa:** Rediseño de la sección Cuentas (UX/UI en Claude Design → implementación)
**Estado:** Borrador — fase de diseño en Claude Design (abierto 2026-09-24, sesión 9)

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a
la vez** — nace como borrador desde la primera idea, se refina en vivo (crear
→ revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por
bloque. Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a
un nombre que caduca cuando la iniciativa cierra.

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Siguiente"/"Después").

## Contexto

El usuario quiere rediseñar la UX/UI de `/cuentas` en Claude Design **antes**
de implementar nada. Con el diseño final (HTML) se redefinen la arquitectura,
el backend y la UI necesarios para que funcione. Es el mismo principio de la
decisión 015 (Design decide, Code implementa), aplicado a una pantalla en vez
de a un PDF. Incluye el pendiente "filtro de estado en la vista principal"
del roadmap, cuyo diseño no se había cerrado.

## Flujo

1. **Réplica del estado actual (hecho, sesión 9).** Se capturó el DOM real de
   `/cuentas` con Playwright: app en local con las APIs simuladas y el bypass
   de e2e, datos de ejemplo de 5 proyectos. Salió un `index.html` autocontenido
   con 20 pantallas (vistas, detalle con sus 3 tabs, modales, estado vacío y
   móvil), el mismo CSS compilado y los tokens `--sn-*`, las fuentes embebidas
   y un visor con tema claro/oscuro, más los PNG y un `LEEME.md` con el
   inventario funcional. Se entregó como zip al usuario; no vive en el repo.
   El script de captura no se commiteó; si hace falta regenerarla, se reescribe
   sobre `tests/e2e/utils/cuentas-mocks.ts`.
2. **Rediseño en Claude Design (usuario).** Sube la réplica y rediseña sobre
   ella.
3. **Entrega del HTML final → Claude Code.** Auditar el diseño contra el código
   real y proponer bloques; se refina este plan hasta aprobarlo.
4. **Implementación** bloque por bloque (rama + PR), con los e2e de Cuentas
   actualizados solo donde el cambio de producto lo justifique.

## Infraestructura existente a reutilizar (a confirmar en el paso 3)

- UI: `app/components/cuentas/*` (CuentasPage, CuentasPorProyecto,
  CuentasTable, CuentaDetailModal, tabs, OrdenPagoModal) y los primitivos de
  `components/ui/` (FilterTabs, StatusBadge, SearchInput, Modal, TableFooter).
- Datos:
  - las RPCs `buscar_cuentas_cobrar`, `buscar_cuentas_pagar_grupos` y
    `cuentas_por_proyecto`;
  - las rutas de `/api/cuentas-cobrar/*`, `/api/cuentas-pagar/*` y
    `/api/cuentas/por-proyecto`;
  - las RPCs atómicas de registrar pago (no recrear su lógica).
- Filtro por estado: patrón de `app/cotizaciones/page.tsx` (`FilterTabs`,
  conteo por estado y la RPC `buscar_cotizaciones`).
- Reglas: decisión 006 (Costo Unitario/Total, cruce fiscal) y
  `lib/shared/cierre-proyecto.ts`.
- Tests: `tests/e2e/critical/cuentas-*.spec.ts` y
  `tests/e2e/utils/cuentas-mocks.ts`.

## Bloques

Se definen en el paso 3, con el HTML final a la vista.

## Tracker

| Paso | Estado |
|---|---|
| 1. Réplica del estado actual | Hecho (sesión 9) |
| 2. Rediseño en Claude Design | En curso (usuario) |
| 3. Auditoría del diseño y plan de implementación | Pendiente |
| 4. Implementación | Pendiente |

## Ciclo de vida

1. **Vacío** (este estado) — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** — una idea se confirma con alcance de iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando
   este archivo directamente.
4. **Aprobado** — cualquier sesión o cuenta puede tomarlo desde aquí y
   ejecutar bloque por bloque, actualizando el tracker de estado conforme
   avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).

Última iniciativa cerrada: "Actualización de formatos PDF vía Claude Design"
— historia en `docs/archive/actualizacion-formatos-pdf-claude-design.md`.
