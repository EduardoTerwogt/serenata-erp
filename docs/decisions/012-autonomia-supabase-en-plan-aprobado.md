# 012 — Autonomía técnica en Supabase durante la ejecución de un plan aprobado

## Contexto

Cada llamada a una herramienta `mcp__Supabase__*` (migración, `execute_sql`, etc.)
disparaba una autorización manual del harness de Claude Code, sin distinguir si el
cambio era parte de un plan que el usuario ya había revisado y aprobado. Eso
frenaba la ejecución de un plan multi-paso esperando clics de aprobación repetidos,
aun cuando la decisión de fondo (qué hacer y por qué) ya estaba tomada.

## Decisión

Dentro de la ejecución de un plan ya aprobado: todo cambio en Supabase necesario
para implementarlo —incluido un borrado que elimina una capacidad sin
reemplazo— se ejecuta sin pausar a pedir autorización. El único gatillo de pausa,
dentro o fuera de un plan, es que el cambio toque una regla de negocio no clara,
genere una contradicción, o no esté claro cuál es el resultado final esperado —
en ese caso se consulta antes de aplicar.

Fuera de un plan aprobado (un pedido suelto de Supabase durante la sesión, no
derivado de un plan ya revisado) se mantiene la regla anterior (ver
`docs/decisions/005-migraciones-manuales-append-only.md`): aditivo o sustitución,
pre-aprobado; borrado sin reemplazo, requiere mostrar el SQL exacto y confirmación
explícita.

## Razón

El costo de pausar por autorización ya lo paga el usuario al aprobar el plan — 
volver a pedirla por cada paso no agrega información nueva, solo fricción. El
único riesgo real que justifica una pausa es ambigüedad de negocio, no el tipo de
operación SQL.

## Alcance técnico

`.claude/settings.json` habilita permanentemente (`permissions.allow`) las
herramientas de Supabase para lectura y escritura de esquema/datos: 
`apply_migration`, `execute_sql`, `list_migrations`, `list_tables`,
`list_extensions`, `get_advisors`, `generate_typescript_types`, `get_project`,
`get_project_url`, `get_publishable_keys`, `query_logs`, `search_docs`,
`deploy_edge_function`, `get_edge_function`, `list_edge_functions`,
`get_organization`, `list_organizations`, `list_projects`, `list_branches`,
`get_cost`, `confirm_cost`.

Ese permiso es técnico y permanente (`.claude/settings.json` no puede condicionar
un permiso a "estamos dentro de un plan aprobado"): la distinción entre "dentro de
un plan" y "pedido suelto" la aplica Claude por criterio, leyendo esta decisión y
`CLAUDE.md` → "Autonomía de ejecución" / "Supabase", igual que el resto de las
reglas de autonomía del proyecto.

**Deliberadamente fuera de la lista de permisos:** `create_branch`, `delete_branch`,
`merge_branch`, `rebase_branch`, `reset_branch`, `create_project`, `pause_project`,
`restore_project` — operaciones de infraestructura de proyecto/branch (crear o
tirar un ambiente completo), no "migración o cambio" de esquema/datos. Siguen
pidiendo autorización manual siempre.

## Alternativas descartadas

- **Autorizar solo lo aditivo, seguir pidiendo confirmación en todo borrado** — 
  es la regla que ya existía y es la que generaba la fricción que se quiso resolver;
  se mantiene únicamente para pedidos fuera de un plan aprobado.
- **Condicionar el permiso técnico a un estado de "plan aprobado" en
  `.claude/settings.json`** — no existe ese mecanismo; el archivo solo puede
  autorizar o no una herramienta, sin contexto de conversación.

## Consecuencias

- Un plan aprobado que incluya cambios de esquema/datos en Supabase (test o
  producción) ya no se detiene a pedir aprobación en cada paso — solo si aparece
  una regla de negocio no clara.
- El registro sigue siendo obligatorio: todo cambio aplicado se guarda como
  migración numerada en `db/migrations/` y se commitea (Principio crítico #3,
  decisión 005).
- Si en el futuro se quiere autorizar también las operaciones de branch/proyecto
  excluidas arriba, hay que decidirlo explícitamente y agregarlas a
  `.claude/settings.json` — no quedan cubiertas por esta decisión.
