---
name: serenata-iniciar-fase
description: Arranca una fase o bloque de trabajo en Serenata ERP auditando primero el estado real del código, sin implementar. Usar al abrir una sesión nueva de trabajo sobre el repo, cuando el usuario pide empezar una fase, retomar el trabajo activo, o auditar un área antes de cambiarla.
user-invocable: true
---

# Iniciar una fase de trabajo

Procedimiento fijo para arrancar. **No implementar nada en este paso.**

## 0. Preguntar qué se va a trabajar y clasificarlo contra el roadmap

Antes de leer nada más: preguntar al usuario qué quiere trabajar esta sesión (si no
lo dijo ya) y cruzarlo contra `docs/ROADMAP.md`. Clasificar:

- **Ya priorizado** — aparece en "Siguiente" o "Después" del roadmap → seguir el
  flujo normal (pasos 1 en adelante).
- **Nuevo** — no está en el roadmap y tiene alcance de iniciativa (toma más de una
  sesión, agrega un módulo/feature, o cambia una capa/arquitectura) → agregarlo
  primero a `docs/ROADMAP.md` (sección "Siguiente" o "Después", según indique el
  usuario) **antes** de crear `docs/ACTIVE_WORK.md`. Así queda registrado y no se
  pierde si la sesión no termina.
- **Fuera de roadmap** — ajuste puntual, fix chico o tarea administrativa de una
  sola sesión → se trabaja directo, sin tocar `ROADMAP.md`. Se documenta el
  resultado al cerrar sesión en `ACTIVE_WORK.md` ("Completado"), no antes.

Esta es una heurística de tamaño, no una regla mecánica: si el caso no es obvio,
proponer la clasificación al usuario y esperar su confirmación en vez de asumir.

## 1. Leer el contexto mínimo

En este orden, y solo esto:

1. `docs/ACTIVE_WORK.md` — qué se está construyendo y qué bloque sigue.
2. `ARCHITECTURE.md` — cómo está construido hoy.
3. `docs/decisions/` — solo las decisiones que toquen el área en cuestión.
4. `docs/ROADMAP.md` — solo si hace falta saber qué está a medias en esa área.

**1b.** Si `docs/ACTIVE_WORK.md` indica una iniciativa EF-3 activa, leer
también el tracker de `docs/EF-3_ENGINEERING_HARDENING.md` (Sección 11),
localizar el bloque `En curso` o el siguiente `Pendiente` según el grafo de
dependencias (Sección 5), y partir de ahí en vez de re-proponer desde cero.

No leer `docs/archive/` salvo que haga falta entender el origen de una decisión.
No leer el roadmap completo: la fase actual es la que importa.

## 2. Situarse en la rama de trabajo

**Excepción:** si el trabajo de la sesión es 100% documentación (solo archivos
`.md`), este paso no aplica — se commitea y pushea directo a `main` al cerrar (ver
`serenata-cerrar-sesion`).

**Nunca `git reset --hard`.** Verificar primero y no destruir nada:

```bash
git status                                  # ¿hay trabajo sin commitear?
git fetch origin main
git branch -f main origin/main              # main local siempre = main real
git switch -c <rama-de-fase> origin/main    # o git switch <rama> si ya existe
```

Si el árbol está sucio o la rama ya tiene commits, preguntar antes de tocar nada.

En cuanto exista el primer commit útil de la rama, abrir el PR hacia `main` **en
borrador** — no esperar a terminar el trabajo. Los workflows de CI (`test.yml`,
`e2e.yml`, `migrations.yml`) solo se disparan por evento de PR o push a `main`; sin
PR abierto, los pushes a la rama no corren ningún test real.

Leer el código real del área. **Nunca asumir desde memoria de una conversación
anterior ni desde lo que dice un documento** — el código manda.

## 3. Localizar infraestructura reutilizable

Antes de proponer algo nuevo, buscar qué ya existe y podría extenderse. Un segundo
motor en paralelo es casi siempre la respuesta equivocada. Para búsquedas amplias
sobre todo el repo, usar un subagente y traer solo el resumen.

## 4. Detectar riesgos

No solo bugs actuales para dos usuarios. Evaluar seguridad, concurrencia,
comportamiento serverless, escalabilidad, duplicación, acceso a datos y fallos de
servicios externos, pensando en ~100 usuarios y ~1,000 proveedores.

Clasificar **P0 / P1 / P2**.

## 5. Proponer

Entregar en este formato:

```
Estado actual   → cómo funciona hoy, con referencias al código real
Problema        → qué falta o qué está mal
Infraestructura → qué ya existe y se puede reutilizar
Opciones        → A / B / C con su trade-off
Recomendación   → cuál y por qué
Bloques         → división incremental propuesta
Riesgos         → P0/P1/P2
Validación      → cómo vamos a demostrar que funciona
```

## 6. Esperar aprobación

**No implementar.** El usuario aprueba, ajusta o descarta. Una vez aprobado el plan,
ejecutar bloque por bloque, validando cada uno antes de avanzar al siguiente.
