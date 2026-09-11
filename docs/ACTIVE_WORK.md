# Trabajo activo

**Última actualización:** 2026-09-11

## Estado

**Ninguna iniciativa activa.**

**Último cierre — ajuste puntual fuera de roadmap:** sesión completa de higiene del
flujo de sesión y auditoría de contradicciones en la documentación. No tocó código
ni arquitectura, por eso no entró a `docs/ROADMAP.md` como iniciativa. Todo mergeado
o pusheado directo a `main` (commits `f688708` → `010f169`, el último vía la
excepción de doc-only recién creada en esta misma sesión).

Resumen de lo que cambió (el detalle vive en `CLAUDE.md` y los commits mismos, no se
repite aquí):

- `CLAUDE.md` documenta ahora el flujo completo rama → PR (en borrador, desde el
  primer commit) → CI verde → merge, más la excepción: un diff 100% `.md` va directo
  a `main`, sin rama ni PR.
- `serenata-iniciar-fase` gana un paso 0 (clasificar el pedido de la sesión contra
  el roadmap) y el recordatorio de abrir el PR en borrador temprano.
- `serenata-cerrar-sesion` exige confirmar que existe un PR antes de dar un "CI en
  verde" por válido.
- Auditoría de contradicciones en toda la documentación (3 sub-agentes, root docs +
  `.claude/` + `docs/`): se corrigieron imprecisiones en `README.md`/`TESTING.md`, se
  actualizó `DESIGN_SYSTEM.md`/`ui.md`/`ROADMAP.md` para reflejar que la migración de
  Fase 5.7 ya está completa (estaban marcando como pendientes archivos que ya usan
  los tokens nuevos), se agregó una excepción estrecha a `migraciones.md` (editar una
  migración vieja solo para sincronizar el archivo con producción, nunca para
  cambiar comportamiento), y se anotó un hallazgo nuevo para Engineering Hardening
  (ver abajo).
- `main` local estaba divergido de `origin/main` (50 commits propios de una época
  pre-reforma). Sincronizado, y el setup de sesión en `CLAUDE.md`/
  `serenata-iniciar-fase` ahora fuerza `main` local = `origin/main` en cada sesión.

Historial de iniciativas cerradas (Fase 8.7, 8.7.1, colaboración en cotizaciones,
etc.): ver `docs/ROADMAP.md` → **Cerrado**, con enlaces a `docs/archive/`.

## Tests ejecutados

CI real en cada uno de los pushes directos a `main` de esta sesión (`test.yml`,
`e2e.yml`, `migrations.yml`) — todos verdes en el commit final `010f169`. Dos flakes
puntuales del job `live` (contra Supabase/Drive de prueba reales) en commits
intermedios, ambos confirmados como infraestructura y no del cambio: el commit
inmediato siguiente, con el mismo código de app, pasó limpio.

## Problemas encontrados (abiertos)

- **Flake recurrente en el job `live`.** Van tres ocasiones distintas en lo que va
  del día (`planeacion.spec.ts` en el PR #26, y dos veces más en pushes directos de
  esta sesión) donde `live` falla y el commit inmediato siguiente —con el mismo
  código— pasa limpio. Nunca se investigó la causa raíz porque cada vez el diff no
  tocaba código de la app. Si sigue repitiéndose, vale la pena investigar
  `live` en sí (¿timeout corto, contención de red hacia el Supabase/Drive de
  prueba?) — candidato natural para el frente E (Pruebas de carga) o uno nuevo de
  Engineering Hardening.
- **PUT genérico en `cuentas-pagar` contradice `.claude/rules/api.md`.**
  `app/api/cuentas-pagar/route.ts` actualiza `estado`/`fecha_pago`/`monto_pagado` por
  un `PUT` genérico pese a existir `registrar-pago` como endpoint dedicado. Anotado
  en detalle en `docs/archive/auditoria-ingenieria-2026-09.md` (frente C), para
  decidir cuando arranque Engineering Hardening. No se tocó código.

## Deuda técnica conocida (sin resolver, intencional)

- **Capa genérica `base`/`conflict`:** el protocolo de conflictos por campo sigue
  siendo específico de Cotizaciones. Se decide su forma genérica cuando Proyectos
  exista como segundo consumidor real, no antes.

## Siguiente paso

Ver `docs/ROADMAP.md` — **Engineering Hardening** es la siguiente iniciativa
comprometida, sin arrancar todavía. Auditar primero (`/serenata-iniciar-fase`) antes
de definir bloques — ya tiene dos hallazgos nuevos que sumar a los del frente C.
