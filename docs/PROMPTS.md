# Prompts reutilizables

Los prompts para trabajar en este repo desde Claude Code. Copiar tal cual.

**No hace falta pegar contexto.** `CLAUDE.md` se carga automáticamente en cada
sesión de Claude Code — principios críticos, reglas de git, autonomía, regla de
producción de Supabase y patrones obligatorios ya están ahí sin pedirlos. Las reglas
de `.claude/rules/` entran solas al leer un archivo de esa ruta (`git.md` carga
siempre). Por eso los prompts de abajo apuntan a `docs/ACTIVE_WORK.md` (lo que
cambia entre sesiones) y a `docs/PLAN.md` cuando hay una iniciativa multi-sesión en
borrador, refinamiento o ejecución — es el único canal real entre cuentas de Claude
distintas, porque la memoria automática es local a cada cuenta/máquina y no se
comparte entre ellas.

---

> **Se trabaja en rama, nunca directo sobre `main`.** El merge ocurre una sola vez,
> cuando la iniciativa está terminada y todas las suites pasaron en el PR. Ver
> `CLAUDE.md`, "Rama + PR, merge al final".

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

## Arrancar una idea nueva (todavía sin plan)

```
Tengo una idea nueva: [descripción]. Audítala contra el código real y
clasifícala contra @docs/ROADMAP.md. Si tiene alcance de iniciativa (más de
una sesión), abre @docs/PLAN.md con un primer borrador — contexto, opciones,
bloques propuestos — y pushéalo de inmediato aunque no esté terminado. No
implementes todavía.
```

## Continuar el loop de refinamiento de un plan en borrador

```
Sigue refinando @docs/PLAN.md. Estado actual: [ajuste/pregunta]. Actualiza el
archivo directamente, no solo me respondas en el chat, y pushea cada vuelta.
```

## Ejecutar un plan ya aprobado (posiblemente desde otra cuenta)

```
@docs/PLAN.md está aprobado. Ejecuta el siguiente bloque pendiente según su
tracker y grafo de dependencias. Actualiza el tracker del propio
@docs/PLAN.md al cerrar cada bloque, no solo @docs/ACTIVE_WORK.md.
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

## Rediseñar un PDF en Claude Design

Flujo completo y motivo: `docs/PLAN.md` y
`docs/decisions/015-pdfs-disenados-en-claude-design.md`. **Paso 1**, en
Claude Design con el design system de Serenata activo y un PDF real del
formato actual adjunto (ajustar las secciones del documento):

```
Rediseña el PDF de [DOCUMENTO] de Serenata House. Adjunto el PDF actual.

## Objetivo
Conservar la estructura, el orden de secciones y el carácter del formato
actual; hacerlo más estilizado y alineado con el design system de Serenata y
con el PDF de Cotización ya rediseñado (tinta #1D1D1F, acento #FE7B01,
hairlines, bandas oscuras redondeadas). No es un rediseño desde cero.

## Restricción técnica (obligatoria)
Se implementa con jsPDF (coordenadas fijas), NO con HTML→PDF:
- A4 vertical 210 × 297 mm. Márgenes y posiciones en mm.
- Inter en máximo 3 pesos (Regular, SemiBold, Bold). Tamaños en pt.
- Solo colores planos en hex. Sin gradientes, sombras, blur ni transparencias.
- Radios simples en mm. Sin íconos de CDN. Imágenes: isotipo y wordmark naranja.
- Grosor y color de cada línea.

## Contenido y orden (conservar)
[Listar secciones, campos y textos legales EXACTOS del PDF actual.]

## Estados (cada uno en su propia página A4)
A. Caso corto (1 página). B. Caso largo multipágina: cómo continúa la tabla,
encabezado/pie de página, qué pasa si el bloque final no cabe. C. Casos
límite (textos largos, campos vacíos). Datos realistas de productora en CDMX.

## Entregables
1. HTML con cada página a 210×297 mm reales (CSS en mm).
2. Tabla de especificación: márgenes, anchos y altos en mm; tamaño/peso/color
   de cada estilo de texto; paleta hex con uso; líneas; paddings; reglas de
   salto de página.
3. Lista corta de qué cambió respecto al formato actual.
```

**Paso 2**, en Claude Code: exportar el proyecto de Claude Design como
`.zip`, subirlo al chat y pedir:

```
Implementa el formato de [DOCUMENTO] del zip adjunto en su generador de
lib/server/pdf/ siguiendo docs/PLAN.md. Si tienes dudas, pregúntame.
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
| Terminó la iniciativa completa y todo está verde | Merge del PR a `main`. Es el único momento en que se toca `main` |
| Dudas laterales durante la implementación | Chat aparte, para no llenar el hilo principal |

---

## Quién escribe qué

| Documento | Se trabaja en |
|---|---|
| `docs/ROADMAP.md` | Chat — es dirección de producto |
| `docs/ACTIVE_WORK.md` (initiative, objetivo, necesidad de negocio, no decidido) | Chat — es producto |
| `docs/ACTIVE_WORK.md` (estado, bloques cerrados, tests, siguiente paso) | Code, al cerrar sesión |
| `docs/PLAN.md` (borrador, refinamiento, tracker de ejecución) | Chat inicia el borrador; Code lo refina y mantiene el tracker durante la ejecución |
| `ARCHITECTURE.md`, `docs/decisions/`, `.claude/rules/` | Code, al cerrar sesión |
| `DESIGN_SYSTEM.md` y el design kit | Design decide, Code persiste |

Producto define **qué** debe ocurrir y **por qué**. Ingeniería elige **cómo**.
