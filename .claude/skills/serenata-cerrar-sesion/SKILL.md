---
name: serenata-cerrar-sesion
description: Cierra una sesión de trabajo en Serenata ERP persistiendo el estado en los documentos del repo antes de que la conversación termine. Usar cuando el usuario dice que va a cerrar, terminar, o dejar aquí el trabajo, cuando se completó un bloque, o antes de abrir una sesión nueva.
user-invocable: true
---

# Cerrar sesión

El objetivo es que la conversación pueda morir completa sin perder nada. Git
conserva el estado; la sesión no.

## 1. Actualizar `docs/ACTIVE_WORK.md`

Reescribirlo —no acumular— con:

- **Completado** en esta sesión.
- **Decisiones nuevas** que se tomaron.
- **Tests ejecutados** y su resultado real (no "debería pasar").
- **Problemas encontrados** que siguen abiertos.
- **Deuda técnica** relevante que se generó o se descubrió.
- **Siguiente paso** concreto.

Purgar el debugging ya resuelto, las hipótesis descartadas y los logs viejos. No son
contexto permanente.

## 2. Preguntar: ¿`ARCHITECTURE.md` sigue siendo verdad?

Si el trabajo cambió capas, auth, acceso a datos, RPCs, integraciones, Realtime o un
patrón transversal, actualizarlo **antes** de cerrar. `ARCHITECTURE.md` describe
`main`, no lo que queremos tener algún día.

## 3. ¿Hay una decisión que alguien podría volver a cuestionar en seis meses?

Si sí, crear un archivo nuevo en `docs/decisions/` con el formato:

```
# NNN — Título

## Contexto      qué problema existía
## Decisión      qué elegimos
## Razón         por qué
## Alternativas descartadas
## Consecuencias qué implica para features futuras
```

Solo decisiones duraderas. No hace falta documentar cada decisión pequeña.

## 4. ¿Cambió lo que la app hace o cómo lo hace?

- Si un módulo nuevo quedó funcionando y probado → agregarlo a "Módulos y cobertura"
  en `ARCHITECTURE.md`, con la prueba que lo respalda.
- Si apareció un feature construido a medias a propósito → documentarlo en
  `docs/ROADMAP.md`, sección "Features a medias".
- Si se descubrió una trampa del repo que costará un bug a futuro → gotchas de
  `ARCHITECTURE.md`.

## 5. ¿Terminó una iniciativa completa?

Actualizar `docs/ROADMAP.md` y mover la bitácora larga —si la hubo— a
`docs/archive/`.

## 6. Commit y push a la rama

**Si todo el diff de la sesión es documentación (solo `.md`):** commitear y pushear
directo a `main`. No hace falta rama, PR ni CI — un `.md` no lo ejecuta el build ni
los tests.

**Si el diff toca cualquier otra cosa** (código, migraciones, config, scripts):
commitear la documentación junto con el trabajo y pushear **a la rama**, no a
`main`.

**Confirmar que existe un PR abierto para esta rama.** Si no se abrió al iniciar
sesión, abrirlo ahora (en borrador) antes de seguir — sin PR, ningún push a la rama
dispara `test.yml`, `e2e.yml` ni `migrations.yml`, así que no hay CI que confirmar.

Confirmar que CI quedó en verde de verdad — no solo que el push tuvo éxito.

**El merge a `main` no es parte de cerrar sesión.** Ocurre una sola vez, cuando la
iniciativa completa está terminada, todas las suites pasaron en el PR y el Preview de
Vercel desplegó bien. Si el trabajo sigue abierto, la rama se queda como está.

## 6bis. Si esta sesión mergeó un bloque de EF-3 a `main`

Sincronización documental inmediata (commit doc-only) que marca ese bloque
`Cerrado` con PR+SHA (o Commit SHA si es de los 6 bloques doc-only) en el
tracker de `docs/EF-3_ENGINEERING_HARDENING.md`, y marca `En curso` el
siguiente bloque del grafo — esto sí es parte de cerrar sesión, a diferencia
del merge de código (que sigue rama+PR normal). Si el bloque quedó a medias,
el checkpoint va también en el tracker, no solo en `ACTIVE_WORK.md`.
