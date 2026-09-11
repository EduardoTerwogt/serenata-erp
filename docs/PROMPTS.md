# Prompts reutilizables

Los prompts para trabajar en este repo desde Claude Code. Copiar tal cual.

**No hace falta pegar contexto.** `CLAUDE.md` se carga automáticamente en cada
sesión de Claude Code — principios críticos, reglas de git, autonomía, regla de
producción de Supabase y patrones obligatorios ya están ahí sin pedirlos. Las reglas
de `.claude/rules/` entran solas al leer un archivo de esa ruta. Por eso los prompts
de abajo solo apuntan a `docs/ACTIVE_WORK.md`: es lo único que cambia entre sesiones.

---

> **Nota sobre los slash commands.** El registro de comandos se arma al arrancar la
> sesión. Si tu entorno actualiza el repo después de ese momento,
> `/serenata-iniciar-fase` puede no salir en el autocompletado aunque el archivo
> exista. No importa: pedirlo en lenguaje natural activa la misma skill, porque su
> campo `description` coincide. Por eso abajo va primero la forma en lenguaje natural.

## Abrir una sesión de trabajo

```
Arranca la fase actual de @docs/ACTIVE_WORK.md
```

Activa `serenata-iniciar-fase`: lee `ACTIVE_WORK.md`, inspecciona `main`, busca
infraestructura reutilizable, clasifica riesgos P0/P1/P2 y propone. **No implementa.**

Equivalentes: `/serenata-iniciar-fase` (si el comando aparece) o
`Usa la skill serenata-iniciar-fase`.

Versión explícita, si prefieres no depender de la skill:

```
Trabajemos la fase actual de @docs/ACTIVE_WORK.md. Revisa main y
@ARCHITECTURE.md. Audita primero cómo funciona hoy, qué infraestructura
existente podemos reutilizar, riesgos y tu recomendación. No implementes todavía.
```

## Revisar una propuesta antes de aprobarla

```
Antes de ejecutar, explícame: qué problema soluciona, qué cambia, por qué es
mejor que dejarlo como está, qué código existente reutiliza, qué riesgos
introduce y cómo vamos a demostrar que funciona.
```

## Ajustar un plan

```
Estoy de acuerdo con [X], pero quiero que [Y]. Ajusta el plan para soportar eso.
```

## Ejecutar un bloque aprobado

```
Ejecuta únicamente el siguiente bloque aprobado en @docs/ACTIVE_WORK.md.
Mantén el alcance limitado. Reutiliza infraestructura existente. Corre las
pruebas que correspondan al riesgo del cambio y no avances al siguiente
bloque si este no queda validado.
```

## Auditoría de un área

```
Audita [área] como senior software engineer. No solo bugs actuales para 2
usuarios: seguridad, concurrencia, serverless, escalabilidad, duplicación,
acceso a datos, fallos externos, con ~100 usuarios y ~1,000 proveedores.
Clasifica P0/P1/P2. No implementes todavía.
```

## Búsqueda amplia sobre todo el repo

Para que los 100 archivos encontrados no llenen el contexto principal:

```
Usa un subagente para [buscar/clasificar X en todo el repo] y tráeme solo el
resumen: cuántos usos, cuáles requieren corrección, cuáles son razonables.
```

## Cerrar sesión

```
Vamos a cerrar la sesión
```

Activa `serenata-cerrar-sesion`. Reescribe `ACTIVE_WORK.md`, verifica si `ARCHITECTURE.md` sigue siendo verdad, mueve
a `docs/decisions/` lo que alguien podría cuestionar en seis meses, purga el
debugging resuelto y commitea.

---

## Comandos de control

| Situación | Comando |
|---|---|
| Claude tomó un camino equivocado | `/rewind` al punto anterior y aclarar la dirección — mejor que acumular "no, deshaz eso" |
| El contexto se llenó pero la tarea es la misma | `/compact`, indicando qué conservar (arquitectura aprobada, archivos modificados, decisiones) y qué descartar (debugging resuelto, hipótesis descartadas) |
| Cambió la tarea, el módulo o la subfase | Sesión nueva. No mantener una sesión durante semanas |
| Dudas laterales durante la implementación | Chat aparte, para no llenar el hilo principal |

---

## Quién escribe qué

| Documento | Se trabaja en |
|---|---|
| `docs/ROADMAP.md` | Chat — es dirección de producto |
| `docs/ACTIVE_WORK.md` (initiative, objetivo, necesidad de negocio, no decidido) | Chat — es producto |
| `docs/ACTIVE_WORK.md` (estado, bloques cerrados, tests, siguiente paso) | Code, al cerrar sesión |
| `ARCHITECTURE.md`, `docs/decisions/`, `.claude/rules/` | Code, al cerrar sesión |
| `DESIGN_SYSTEM.md` y el design kit | Design decide, Code persiste |

Producto define **qué** debe ocurrir y **por qué**. Ingeniería elige **cómo**.
