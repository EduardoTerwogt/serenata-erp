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

Última iniciativa cerrada: "Producción y Vercel a Ohio" (#124, 2026-10-06) —
historia en `docs/archive/produccion-ohio.md`, resultado en
`docs/decisions/021-region-ohio.md`.

**Cola de iniciativas (2026-10-06, decisión del usuario), en este orden:**
**#123** nueva lógica de cuentas → **#110** frente 2 v2 (plan auditado guardado
en el issue; depende de #123) → **#125** llaves de Supabase legacy →
publishable/secret (prioridad baja, última; fecha límite interna **2026-12-01**,
revisión el 2026-11-01).
