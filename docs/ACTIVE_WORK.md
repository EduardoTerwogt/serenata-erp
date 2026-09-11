# Trabajo activo

**Última actualización:** 2026-09-11

## Estado

**Ninguna iniciativa activa.**

**Último cierre — ajuste puntual fuera de roadmap:** se reforzó la documentación del
flujo de sesión (no tocó código ni arquitectura, por eso no entró a
`docs/ROADMAP.md` como iniciativa). Mergeado a `main` en `f688708` (PR #26).

- `CLAUDE.md` y `serenata-iniciar-fase` ahora dicen explícitamente que un push a una
  rama sin PR abierto no dispara `test.yml`/`e2e.yml`/`migrations.yml`, y que el PR
  debe abrirse en borrador con el primer commit útil, no al final.
- `serenata-cerrar-sesion` exige confirmar que ese PR existe antes de dar por válido
  un "CI en verde".
- `serenata-iniciar-fase` ganó un paso 0 que pregunta qué se va a trabajar y lo
  clasifica contra el roadmap (ya priorizado / nuevo → se agrega al roadmap antes de
  arrancar / fuera de roadmap → se documenta aquí al cerrar).
- `docs/ROADMAP.md` documenta la misma clasificación en su sección "Cómo se
  mantiene".

Historial de iniciativas cerradas (Fase 8.7, 8.7.1, colaboración en cotizaciones,
etc.): ver `docs/ROADMAP.md` → **Cerrado**, con enlaces a `docs/archive/`.

## Problemas encontrados (abiertos)

- **Flake en `tests/e2e/critical/planeacion.spec.ts`** ("extracción IA: pega texto,
  valida y crea cotizaciones"): en el PR #26 falló por timeout de navegación
  (`toHaveURL(/\/cotizaciones$/)`, 5000ms, recibió `/planeacion`), pero el run de
  `main` inmediatamente anterior pasó el mismo spec en verde con código de app
  idéntico — no se investigó a fondo por ser un PR de documentación pura. Si vuelve a
  fallar de forma intermitente, revisar el timing de esa redirección.

## Deuda técnica conocida (sin resolver, intencional)

- **Capa genérica `base`/`conflict`:** el protocolo de conflictos por campo sigue
  siendo específico de Cotizaciones. Se decide su forma genérica cuando Proyectos
  exista como segundo consumidor real, no antes.

## Siguiente paso

Ver `docs/ROADMAP.md` — **Engineering Hardening** es la siguiente iniciativa
comprometida, sin arrancar todavía. Auditar primero (`/serenata-iniciar-fase`)
antes de definir bloques.
