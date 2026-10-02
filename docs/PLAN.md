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

1. **#125 — Llaves de Supabase** (`anon`/`service_role` legacy → publishable/secret;
   las legacy dejan de funcionar **a fin de 2026**). Siguiente en entrar a este
   archivo.
2. **#124 — Producción y Vercel a Ohio** (`us-east-2` / `cle1`). Plan auditado
   completo en `docs/PLAN.md` del commit `e60d657` (`git show e60d657:docs/PLAN.md`),
   enlazado desde el issue.
3. **#123 — Nueva lógica de cuentas** (facturas y pagos N:M).
4. **#110 — Frente 2 v2 de Cuentas.** Plan auditado guardado en el issue.
