---
name: serenata-iniciar-fase
description: Arranca una fase o bloque de trabajo en Serenata ERP auditando primero el estado real del código, sin implementar. Usar al abrir una sesión nueva de trabajo sobre el repo, cuando el usuario pide empezar una fase, retomar el trabajo activo, o auditar un área antes de cambiarla.
---

# Iniciar una fase de trabajo

Procedimiento fijo para arrancar. **No implementar nada en este paso.**

## 1. Leer el contexto mínimo

En este orden, y solo esto:

1. `docs/ACTIVE_WORK.md` — qué se está construyendo y qué bloque sigue.
2. `ARCHITECTURE.md` — cómo está construido hoy.
3. `docs/decisions/` — solo las decisiones que toquen el área en cuestión.
4. `docs/ESTADO.md` — solo si hace falta saber qué está a medias en esa área.

No leer `docs/archive/` salvo que haga falta entender el origen de una decisión.
No leer el roadmap completo: la fase actual es la que importa.

## 2. Inspeccionar `main`

```bash
git fetch origin main && git reset --hard origin/main
```

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
