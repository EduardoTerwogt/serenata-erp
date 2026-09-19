# Plan de la iniciativa activa

**Estado:** Vacío (2026-09-19) — no hay iniciativa multi-sesión en curso ni en
definición. La última iniciativa (Plantillas: header de tarjeta; Cotizaciones:
UI de edición + fórmula Costo Unitario/Costo Total; Portal: alias/documentos/
historial; Clientes: catálogo editable; Cuentas: rediseño PDF de orden de pago
— 6 bloques) cerró y se archivó en
[`docs/archive/plantillas-cotizaciones-portal-clientes-pdf-orden-pago.md`](archive/plantillas-cotizaciones-portal-clientes-pdf-orden-pago.md),
PR [#76](https://github.com/EduardoTerwogt/serenata-erp/pull/76). Resumen en
`docs/ROADMAP.md` → sección "Cerrado".

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a la
vez** — nace como borrador desde la primera idea, se refina en vivo (crear →
revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por bloque.
Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a un nombre que
caduca cuando la iniciativa cierra (es lo que le pasó al tracker de Engineering
Hardening, `docs/EF-3_ENGINEERING_HARDENING.md`, archivado en
[`docs/archive/ef-3-engineering-hardening.md`](archive/ef-3-engineering-hardening.md)).

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Cómo se mantiene").

## Ciclo de vida

1. **Vacío** (este estado) — no hay iniciativa multi-sesión en curso ni en
   definición.
2. **Borrador** — una idea se confirma con alcance de iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando este
   archivo directamente.
4. **Aprobado** — cualquier sesión o cuenta puede tomarlo desde aquí y
   ejecutar bloque por bloque, actualizando el tracker de estado conforme
   avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).
