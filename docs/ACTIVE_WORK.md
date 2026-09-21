# Trabajo activo

**Última actualización:** 2026-09-21

## Estado

**`docs/PLAN.md` — Borrador, "Editor de PDFs".** Nueva iniciativa: módulo de
sidebar para editar visualmente los 4 PDFs que genera Serenata (tablas,
posición libre, texto y color acotado a la paleta del design system).
Reemplaza en `docs/PLAN.md` a "Sueltos post-PR #76", que cerró parcial esta
misma sesión (3/4 bloques; el 4° — filtro de estado en Cuentas — se diferió
a `docs/ROADMAP.md` → "Después" por decisión del usuario, para liberar el
slot del tracker). Sesión 100% documentación: alcance y arquitectura del
motor de plantillas validados con el usuario y con un mockup interactivo
(https://claude.ai/artifact/71nqoQ31msihVcE3tr1Bde), pero **sin código
tocado** — falta decidir la opción de arquitectura (A/B/C, ver `docs/PLAN.md`)
antes de pasar a "Aprobado" y arrancar el Bloque 1.

## Completado en esta sesión — cierre parcial de Sueltos + apertura de Editor de PDFs

- `docs/PLAN.md` recreado con el borrador de "Editor de PDFs" (contexto,
  alcance preciso pedido por el usuario, infraestructura reutilizable,
  opciones de arquitectura, bloques propuestos, riesgos, validación, link
  al mockup).
- Iniciativa anterior archivada:
  `git mv docs/PLAN.md docs/archive/sueltos-portal-utilidad-cliente-id-fk.md`,
  con nota de cierre (bloques 1-3 cerrados en PR #77/#79, bloque 4
  diferido).
- `docs/ROADMAP.md`: resumen de Sueltos 1-3 en "Cerrado"; Bloque 4 (filtro
  de estado en Cuentas) movido a "Después" → "Sueltos pendientes" junto al
  suelto de Dashboard; "Siguiente" apunta ahora a Editor de PDFs; quitado
  "editor de PDFs tipo Canva" de "Fuera de alcance, sin cambios" (ya no
  aplica).
- Diff completo de la sesión es 100% `.md` → commit + push directo a `main`
  (excepción doc-only de `.claude/rules/git.md`, sin rama ni PR).

## Tests ejecutados y resultado real

No aplica — sesión sin cambios de código, config, migraciones ni rutas.

## Problemas encontrados que siguen abiertos

Ninguno nuevo.

## Deuda técnica (arrastrada, sin cambios esta sesión)

Presence sin verificar en Preview, `SUPABASE_JWT_SECRET` distinto entre
Production/Preview en Vercel, `AUTH_SECRET`/`NEXTAUTH_SECRET` coexistiendo
en producción, `tracker-lint` de `test.yml` sin generalizar fuera de EF-3,
verificación completa de Google OAuth pendiente, ramas remotas ya mergeadas
sin borrar por policy del proxy de egress. Detalle histórico de cada una en
`docs/archive/` y sesiones previas — sin novedad, no se investigaron de
nuevo esta sesión.

## Siguiente paso

1. Decidir con el usuario la arquitectura del motor de plantillas del
   Editor de PDFs (opción A — schema JSON tipo `pdfme`, recomendada — vs.
   B/C, ver `docs/PLAN.md`) y pasar el plan a "Aprobado".
2. Con el plan aprobado, arrancar Bloque 1 (spike técnico) en una sesión
   futura (`/serenata-iniciar-fase`).
3. Bloque 4 de la iniciativa anterior (filtro de estado en Cuentas) sigue
   disponible como pendiente suelto en `docs/ROADMAP.md` → "Después" si se
   prioriza antes que el Editor de PDFs.
