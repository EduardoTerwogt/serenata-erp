# Plan de la iniciativa activa

**Estado:** Vacío — no hay iniciativa multi-sesión en curso ni en definición.

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a
la vez** — nace como borrador desde la primera idea, se refina en vivo (crear
→ revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por
bloque. Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a
un nombre que caduca cuando la iniciativa cierra.

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Siguiente"/"Después").

## Ciclo de vida

1. **Vacío** — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** — una idea se confirma con alcance de iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando
   este archivo directamente.
4. **Aprobado** — cualquier sesión o cuenta puede tomarlo desde aquí y
   ejecutar bloque por bloque, actualizando el tracker de estado conforme
   avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).

Última iniciativa cerrada: "Simplificación del modelo de datos" (2026-10-02)
— historia en `docs/archive/simplificacion-modelo-datos.md`, resultado en
`docs/decisions/020-simplificacion-modelo-datos.md`.


**Cola de iniciativas (2026-10-02), en este orden:**

1. **#124 — Paridad de entornos** (test a `us-west-2`, misma versión de Postgres
   que producción). Siguiente en entrar a este archivo.
2. **#123 — Nueva lógica de cuentas** (facturas y pagos N:M). Su plan se escribe
   al cerrar #124.
3. **#110 — Frente 2 v2 de Cuentas.** Plan completo y auditado guardado en el
   issue #110; se copia aquí cuando le toque. Antecedente en
   `docs/archive/frente2-cuentas-conceptos-pausado.md`.
