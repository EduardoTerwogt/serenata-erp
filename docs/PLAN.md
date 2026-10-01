# Plan de la iniciativa activa

**Estado:** Borrador — "Simplificación del modelo de datos" (2026-10-01).

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a
la vez** — nace como borrador desde la primera idea, se refina en vivo (crear
→ revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por
bloque. Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a
un nombre que caduca cuando la iniciativa cierra.

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Siguiente"/"Después").

## Ciclo de vida

1. **Vacío** — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** (este estado) — una idea se confirma con alcance de iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando
   este archivo directamente.
4. **Aprobado** — cualquier sesión o cuenta puede tomarlo desde aquí y
   ejecutar bloque por bloque, actualizando el tracker de estado conforme
   avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).

Última iniciativa cerrada: "Rediseño de la sección Cuentas" (2026-09-26)
— historia en `docs/archive/rediseno-cuentas.md`.

**Iniciativa en pausa:** "Frente 2 — `cuentas_conceptos` sin recálculo por
RPC" (epic #110, PR #100, rama `claude/wonderful-hamilton-260e2w`) — estado exacto y
cómo retomarla en `docs/archive/frente2-cuentas-conceptos-pausado.md`.

---

# Simplificación del modelo de datos

**Epic en GitHub:** #109. Fase 2: #105 · Fase 3: #106 · deuda relacionada: #108.

## Origen

El 2026-10-01 el usuario revisó el Schema Visualizer de Supabase y percibió
**demasiadas tablas**, con la información repartida en muchos lugares. Pidió
abrir una iniciativa para explorarlo antes de seguir con el frente 2.

## Qué se sabe hoy

Detalle en `docs/inventario-tablas.md` (producción, 2026-10-01):

- 40 tablas en `public`; **11** alimentan los conceptos de Cuentas
  (`cuentas_conceptos`): `cotizaciones`, `proyectos`, `proveedores`,
  `cuentas_cobrar`, `cuentas_pagar`, `cuentas_pagar_grupos`,
  `pagos_comprobantes`, `pagos_cuentas_pagar`, `documentos_cuentas_cobrar`,
  `documentos_cuentas_pagar` y `cuentas_reaperturas`.
- La dispersión ya tuvo costo medible: la tabla `cuentas_conceptos_base` y sus
  triggers (frente 2) existen para no juntar esas 11 tablas en cada lectura, y
  la invariante de grupos necesitó un trigger propio (`20261008`).
- Hipótesis a validar (no son decisiones): cobrar y pagar son modelos
  paralelos (pagos y documentos casi idénticos); `cuentas_pagar` y
  `cuentas_pagar_grupos` duplican estado; hay datos de terceros copiados en
  varias tablas; dos mecanismos de idempotencia; un posible residuo de
  migración. Ver "Observaciones" en el inventario.
- **No** todo se puede fusionar: varias separaciones existen por reglas de
  negocio (R1, D22, D28; `docs/decisions/006` y `011`) y la BD protege hoy
  esas invariantes.

## Objetivo (a confirmar con el usuario)

Reducir los lugares donde hay que buscar o mantener el mismo dato, **sin
perder** las invariantes de dinero e impuestos y sin romper lo que funciona.
"Menos tablas" es un medio, no la meta: el criterio es **menos dispersión y
menos duplicación de estado**.

## Fuera de alcance (por ahora)

- Cambiar reglas de negocio (`docs/decisions/006`).
- Tocar producción: esta iniciativa no aplica ninguna migración hasta
  aprobarse con plan.
- Decidir fusiones antes de la fase 2.

## Fases

| Fase | Qué | Salida | Estado |
|---|---|---|---|
| 1. Inventario | Tablas, columnas, quién las toca (código, RPCs, triggers, FKs) | `docs/inventario-tablas.md` | **Hecha (2026-10-01)** — falta que el usuario la revise |
| 2. Uso real y riesgo | Por tabla/columna: pantalla o ruta que la usa, columnas sin uso, invariantes que protege la BD, costo de migrar (RPCs, triggers, tests live, derivación SQL y TS) | Matriz "fusionar / mantener / derivar" con riesgo P0/P1/P2 | Pendiente |
| 3. Propuestas | 2–3 alternativas de modelo objetivo para Cuentas (la parte más dispersa) y para el resto, con costo y migración de datos | ADR en `docs/decisions/` (candidato 020) | Pendiente |
| 4. Decisión y plan | El usuario elige; se escribe el plan por bloques con migraciones numeradas | Este archivo pasa a "Aprobado" | Pendiente |
| 5. Ejecución | Por bloques, en rama + PR, validado en test con el dataset de miles de registros antes de producción | PRs | Pendiente |

## Preguntas abiertas para el usuario

1. ¿La meta incluye **también** simplificar lo que ve el usuario (pantallas) o
   solo el modelo de datos?
2. ¿Hay tablas que ya sabes que no se usan o que quieres conservar a toda
   costa?
3. ¿Se pausa el frente 2 hasta terminar la fase 3, o se cierra antes con lo ya
   hecho (el PR #100 sigue en borrador y depende de una decisión sobre el
   cómputo de test)?
4. ¿Cuánto cambio de esquema tolera producción antes de pasar a uso real? Hoy
   no hay usuarios finales, así que es el mejor momento para migrar.

## Riesgos

- **P1:** fusionar tablas de Cuentas cambia la derivación SQL y la de TS
  (paridad obligatoria, decisión 017), los triggers del frente 2 y los tests
  live. Se mitiga con la fase 2 antes de proponer nada.
- **P1:** una fusión puede quitar una invariante que hoy la BD hace cumplir.
- **P2:** el inventario usa coincidencia de texto sobre el cuerpo de las
  funciones; puede sobrecontar. Se afina en la fase 2.

## Tracker

| Bloque | Estado |
|---|---|
| Entrada de iniciativa y pausa del frente 2 | Hecho (2026-10-01) |
| Fase 1 — Inventario | Hecho (2026-10-01) |
| Fase 2 — Uso real y riesgo (#105) | Pendiente (espera respuestas a las preguntas abiertas) |
| Tickets en GitHub | Hecho (2026-10-01): epic #109, #105, #106, #108 |
