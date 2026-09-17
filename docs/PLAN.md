# Plan de la iniciativa activa

**Estado:** sin iniciativa activa.

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
   definición. Ver `docs/ACTIVE_WORK.md`/`docs/ROADMAP.md` para qué sigue.
2. **Borrador** — una idea se confirma con alcance de iniciativa (más de una
   sesión, un módulo/feature nuevo, o un cambio de capa/arquitectura). Se llena
   este archivo con la plantilla de abajo, **aunque el plan no esté terminado**.
   Se commitea y pushea de inmediato (doc-only → directo a `main`) para que
   cualquier cuenta de Claude que abra sesión mientras tanto lo vea.
   `docs/ACTIVE_WORK.md` apunta aquí con una línea.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando este
   archivo directamente, no solo conversando en el chat. Cada vuelta del loop es
   un commit doc-only.
4. **Aprobado** — se marca el "Estado" de arriba como `Aprobado, listo para
   ejecutar`. Cualquier sesión o cuenta puede tomarlo desde aquí y ejecutar
   bloque por bloque, actualizando el tracker de estado de este archivo conforme
   avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md` (preserva el historial de git), resumen
   en `docs/ROADMAP.md` → sección "Cerrado", y este archivo se recrea vacío
   (estado 1) para la próxima idea.

## Plantilla al pasar a "Borrador"

```
## Contexto
## Matriz de hallazgos / alcance
## Opciones consideradas
## Bloques propuestos
## Tracker de estado (una fila por bloque: ID | Estado | Rama/PR o Commit SHA | Nota)
## Criterio de cierre
```
