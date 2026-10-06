# 018 — Región de Vercel en `sfo1`, sin migrar Supabase de región

**Reemplazada por `021-region-ohio.md` (#124).** Se conserva como historia.

## Contexto

El usuario reportó que la app en general se siente lenta, en particular
`/cuentas`. Se investigó con datos reales, no intuición:

- `cuentas_periodo` medida directo contra producción (`EXPLAIN ANALYZE`):
  **93 ms** de ejecución — el dataset real de producción es chico (28
  proyectos, 35 CxC, 89 CxP), no es el cuello de botella.
- Cada request autenticado hace un round-trip a Supabase para revocación de
  sesión (`getUsuarioSessionState`, F28) — deliberado, no un bug.
- El deploy de producción corría con `regions: ["iad1"]` (Virginia, el
  default de Vercel) mientras el proyecto de Supabase de producción está en
  `us-west-2` (Oregon) — confirmado vía la API de Vercel
  (`get_deployment`). Cada llamada a Supabase pagaba esa distancia
  transcontinental.
- `/cuentas` dispara 4 llamadas en paralelo al montar (`periodo`, `resumen`,
  `opciones`, `avisos`), cada una pagando ese costo de red por separado —
  explica por qué esa sección se siente peor que el resto.

## Decisión

Pinear `regions: ["sfo1"]` en `vercel.json` (San Francisco, la región de
Vercel más cercana a Oregon, y la que la propia documentación de Vercel usa
como ejemplo canónico para datos "US West"). Cambio de config de deploy
puro, sin tocar código de la app.

**No se migró el proyecto de Supabase de región.**

## Razón

Supabase no permite cambiar la región de un proyecto existente — confirmado
en su documentación oficial ("Change Project Region"): el proyecto está
atado a su hardware a nivel infraestructura. La única forma de "moverlo" es
crear un proyecto nuevo en la región deseada y migrar esquema + datos
(dump/restore), lo que implica:

- Downtime o una ventana de corte planeada.
- Rehacerlo dos veces (`serenata-erp-test` y `serenata-erp` producción) para
  no dejar los entornos desincronizados.
- Riesgo real de dejar algo mal migrado (RLS, extensiones, triggers,
  secretos, configuración de Auth de terceros).

El cambio de región de Vercel resuelve la mayor parte del desajuste
geográfico con cero riesgo (config, no código, reversible en un push) y sin
downtime. Migrar Supabase solo se justificaría si, después de este cambio,
la latencia de red a Supabase siguiera siendo el cuello de botella
dominante — no se ha medido así (ver limitación abajo).

## Alternativas descartadas

- **Migrar el proyecto de Supabase a una región cercana a `sfo1`.** Costo y
  riesgo desproporcionados frente a la ganancia esperada; el cambio de
  región de Vercel ataca la misma causa con una fracción del esfuerzo.
- **Cachear la revocación de sesión (`getUsuarioSessionState`) para evitar
  el round-trip en cada request.** Es un cambio de comportamiento de
  seguridad (retrasaría la revocación instantánea de una sesión, F28) que
  merece su propia conversación explícita con el usuario, no algo para
  meter de paso en un fix de infraestructura.

## Consecuencias

- Cualquier proyecto de Vercel nuevo, o cualquier `functions.regions` por
  ruta que se agregue, debe mantenerse cerca de `us-west-2` — ver gotcha en
  `ARCHITECTURE.md`.
- **No se pudo confirmar con números reales cuánto mejoró la latencia.**
  Tres limitaciones del entorno, en cadena: (1) la analítica de duración
  por función de Vercel (`function_duration_ms`, `ttfb_ms`) requiere el
  plan pagado "Observability Plus", no disponible en esta cuenta — `402`;
  (2) los logs de runtime vía el MCP de Vercel devuelven `403` (limitación
  ya conocida, ver deuda técnica); (3) el proxy de salida de este entorno
  bloquea `curl` directo a las URLs de los deployments de Vercel. La
  confirmación queda en manos del usuario: pestaña "Functions" del
  dashboard de Vercel (gratis, por función/ruta) o la sensación real de uso
  en los próximos días.
- Si tras esto la latencia sigue sintiéndose igual, el siguiente sospechoso
  es el propio patrón de revocación de sesión por request (cachearlo,
  con cuidado de no debilitar la garantía de seguridad), no otro cambio de
  infraestructura.
