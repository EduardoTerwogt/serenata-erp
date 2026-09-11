# Archivo — Rediseño de colaboración en tiempo real (Fases 0-8)

> **Documento histórico.** Registro completo de cómo se construyó la edición
> colaborativa de cotizaciones, fase por fase, hasta cerrar la Fase 8 el
> 2026-09-11 (`main` en `6d47adf`). Se conserva porque explica **por qué** la
> arquitectura quedó como quedó, incluidos los caminos que se descartaron.
>
> **No es contexto de trabajo.** Para el estado vigente ver `docs/ESTADO.md`;
> para las decisiones que siguen siendo obligatorias, `docs/decisions/`.
> Leer este archivo solo cuando haga falta entender el origen de una decisión.

---

## 2. Edición colaborativa de cotizaciones — trabajo en curso

> **Esta sección describe el diseño previo a la Fase 6 (reabierta).** Con el
> cierre de 6A-6F (sección 3 más abajo), `section_signal`/`item_cell_signal`/
> `item_mutation` cliente→cliente ya no existen y el heartbeat pasó de 5s como
> garantía primaria a 20s como red de última instancia detrás de los eventos
> `*_confirmed`. Se deja este texto como registro de por qué se construyó así
> originalmente; para el diseño vigente ver la sección 3, subsección "Fase 6
> (reabierta) — cierre real".

Es el frente activo. Dos personas pueden tener abierta la misma cotización
(`/cotizaciones/[id]`) y editarla a la vez.

### Cómo está construido (y por qué)

- **No hay OT ni CRDT.** No hace falta: no se edita un stream de texto compartido,
  se editan campos de un registro estructurado. El modelo es **último en escribir
  gana, por campo** (el de Figma/Linear), no el de Google Docs.
- **WebSockets sí**, vía Supabase Realtime (`hooks/useQuotationPresence.ts`): un
  canal por cotización con *presence* (quién está) y *broadcast* (avisos de "estoy
  en esta sección", "toqué esta celda", "agregué/borré una fila").
- **La convergencia NO depende de esos avisos.** Son best-effort: `channel.send()`
  cae en silencio a REST cuando el canal no está unido, eso devuelve 403 y el
  `.catch(() => null)` se lo traga. Medido, no supuesto. Por eso la pantalla
  **reconcilia contra la base** cada 5 s (`RECONCILIACION_MS` en
  `app/cotizaciones/[id]/page.tsx`), al reconectar el canal y al volver la pestaña
  a primer plano. Los avisos solo aceleran; la base es la que manda.
- **La reconciliación no pisa lo que estás escribiendo:** conserva las filas con
  edición local en curso, agrega las filas nuevas con `append` (no remonta la
  tabla) y, cuando debe reconstruir con `replace`, restaura el campo enfocado y la
  posición del cursor insistiendo unos frames.
- **Escrituras por sección**, para que dos personas en secciones distintas no se
  borren entre sí: `PATCH /api/cotizaciones/[id]/{general,totales,notas}` y
  `PATCH .../items/[itemId]`. Cada una toca solo lo suyo.
- **Los PATCH bloquean fila en Postgres** (`SELECT ... FOR UPDATE` dentro del RPC)
  y aplican **solo las claves que llegaron**, para no revivir valores viejos de un
  read-modify-write.

### Defectos de producción que este trabajo encontró y arregló

1. `save_cotizacion` **borraba y recreaba todas las partidas con ids nuevos** en
   cada guardado. Era la causa raíz de que se perdieran ediciones ajenas. Ahora
   preserva ids (`db/migrations/20260909_preservar_ids_y_guardados_por_seccion.sql`).
2. El PATCH de una partida hacía read-modify-write y **borraba el campo que el otro
   acababa de escribir**. Ahora es un RPC con bloqueo de fila
   (`db/migrations/20260909_patch_item_cotizacion_rpc.sql`).
3. La consulta de la cotización **no ordenaba las partidas** (`ORDER BY orden`), así
   que las filas se barajaban al actualizar cualquiera.

Los tres se detectaron con el nivel `live`; ningún mock los habría visto.

### Lo que falta

- ~~**[ROJO] Un test live falla:** `cotizaciones-colaboracion.spec.ts:282`~~ —
  **arreglado de raíz en la Fase 6 (reabierta), lectura (a) confirmada: era un
  defecto de producto.** La causa no era solo el `send()` → REST → 403 medido
  aquí (eso se resolvió al pasar a `channel.track()` puro en 6E) sino, además,
  algo más profundo encontrado mientras se cerraba esta fase en CI real: el
  canal de Presence de un colaborador podía caer a `CLOSED` sin que nada lo
  reconectara, dejando esa sesión sin awareness por el resto de la vida de la
  pestaña. Ver el detalle completo, con los logs que lo probaron, en la
  sección 3 → "Fase 6 (reabierta)". El test pasó 9/9 dos veces seguidas en CI
  (`live`) con el fix de reconexión, incluido el caso de esta línea.
- Verificar en local antes de pushear sigue siendo imposible sin abrir la salida de
  red a `ozrtsludmcguvgqdjicn.supabase.co` (el sandbox la tiene bloqueada). Mientras
  tanto, el ciclo es empujar y esperar ~20 min de CI, con el costo que eso tiene.

---

## 3. Rediseño de colaboración en tiempo real — Fase 8 cerrada, READY para Proyectos

Iniciativa de alto riesgo (Realtime, RPCs, seguridad, concurrencia) ejecutada
en branches dedicadas (una por fase: `claude/eloquent-lamport-h7effg` para
Fases 0-7, `claude/fase8-hardening-precotizaciones` para Fase 8) + PR + Vercel
Preview, como excepción explícita aprobada a la regla de "siempre `main`" —
ver la política git de la sección "Git — setup y reglas" de `CLAUDE.md`. El
Preview de cada branch apunta al proyecto Supabase de prueba
(`serenata-erp-test`), no a producción.

Con Fase 8 cerrada (ver más abajo), la auditoría final concluye que la
arquitectura queda **READY para Proyectos sin deuda bloqueante** — el
siguiente paso natural es Fase 9 (Proyectos como segundo piloto real de
colaboración), no incluida todavía.

### Fase 0 — Baseline (cerrada)

Batería completa corrida sobre esta branch antes de tocar nada:

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | Verde |
| `npm run lint` | Verde (0 errores, 9 warnings preexistentes) |
| `npm test` | 378/378 verde |
| `npm run build` | Verde |
| `npm run test:e2e:smoke` | 21/21 verde |
| `npm run test:e2e:critical` | 45/45 verde (incluye los 4 casos de colaboración mockeados de `cotizaciones-editar.spec.ts` vía `tests/e2e/utils/realtime-mock.ts`) |
| `npm run check-migrations` | Verde, 46 migraciones |
| `npm run test:e2e:live` | No corrible en este sandbox (sin salida de red a `ozrtsludmcguvgqdjicn.supabase.co`); se dispara vía `workflow_dispatch` del job `live` en CI |

Nota de entorno: el sandbox de código no tiene salida de red directa al
proyecto Supabase de prueba (confirmado arriba, en la sección 2), pero el
**servidor MCP de Supabase sí tiene acceso directo** a ambos proyectos
(`serenata-erp-test` y `serenata-erp`) — se usó para verificar en vivo el
estado de RLS de `realtime.messages` y para aplicar la migración de Fase 1.
Es un canal distinto del `fetch`/Playwright de la app, que sigue bloqueado.

El caso de colaboración que falla hoy en CI (documentado en la sección 2,
línea ~282 de `cotizaciones-colaboracion.spec.ts`) sigue así a propósito —
no se toca en Fase 0/1, se resuelve solo cuando el modelo de sección-lock se
retire en una fase posterior del rediseño.

Mapa de archivos de la colaboración actual (para quien retome esto):
`hooks/useQuotationPresence.ts`, `lib/supabase-browser.ts`, `lib/supabase.ts`,
`app/cotizaciones/[id]/page.tsx` (`RECONCILIACION_MS`, `reconcileServerItems`),
las 3 rutas PATCH de cotizaciones (`items/[itemId]`, `general`, `totales`) y
sus RPCs (`patch_item_cotizacion`, `patch_cotizacion_general`,
`patch_cotizacion_totales`), `tests/e2e/live/cotizaciones-colaboracion.spec.ts`,
`tests/e2e/utils/realtime-mock.ts`, `tests/e2e/utils/live-helpers.ts`.

### Fase 1 — Infraestructura Realtime segura (cerrada)

Objetivo: cerrar el hueco de seguridad real — hoy cualquiera con la anon key
pública puede unirse al canal `cotizacion:*` de cualquier cotización, porque
`useQuotationPresence.ts` usa un canal público sin autenticación. No toca
todavía el protocolo de mutación (conflicto por campo, `revision` — eso es
Fase 2) ni el grid de partidas.

**Criterios de éxito, congelados por escrito:**

1. Dos clientes autorizados (sesión NextAuth real, sección `cotizaciones`)
   que se unen al mismo canal privado `cotizacion:<id>` reciben un evento de
   prueba emitido por el servidor.
2. Un cliente sin la sección `cotizaciones`, y otro con un token
   expirado/con firma inválida, NO pueden unirse.
3. Con el WebSocket completamente cortado (mismo mecanismo que el caso 8 de
   `cotizaciones-colaboracion.spec.ts`), la reconciliación de 5s converge
   exactamente igual que hoy — Fase 1 no toca ese mecanismo.

Ver el detalle de implementación en el plan de ejecución de la sesión.

**Estado:** verificada en CI real (run
[34426390153](https://github.com/EduardoTerwogt/serenata-erp/actions/runs/34426390153),
PR draft [#13](https://github.com/EduardoTerwogt/serenata-erp/pull/13)) contra
`serenata-erp-test` con "Allow public access" apagado:

- `tests/e2e/live/realtime-channel-authorization.spec.ts`: **4/4 verde** — un
  staff con sección `cotizaciones` se une al canal privado y recibe el evento
  confirmado real; sin esa sección, con firma inválida, o con token expirado,
  el join es rechazado. Los 3 criterios de éxito de arriba quedaron
  demostrados con Realtime real, no mockeado.
- `tests/e2e/live/cotizaciones-colaboracion.spec.ts`: **igual que el
  baseline** — el caso de la línea ~282 sigue fallando por la misma razón ya
  documentada (no una regresión de esta fase); los demás casos, incluido el
  8 (WebSocket cortado → converge por polling), siguen en verde.
- `smoke-and-critical` y `migrations`: verde.
- Unit (`npm test`), `npx tsc --noEmit`, `npm run lint`, `npm run build`: verde.

**Bug encontrado y arreglado durante esta verificación:** el primer intento
del job `live` mostró que el cliente se autorizaba y suscribía bien al canal
privado, pero nunca recibía el broadcast del servidor. Causa raíz:
`sendRealtimeBroadcast()` no marcaba `private: true` en el mensaje enviado al
endpoint REST — sin ese flag, Supabase lo trata como broadcast público y no
lo entrega a un socket unido en modo privado. Corregido en
`lib/server/realtime/broadcast.ts` y los 3 call-sites.

**Pasos manuales completados por el usuario:** JWT Secret cargado en Vercel
(scope Preview) y en el secret `TEST_SUPABASE_JWT_SECRET` de GitHub Actions;
"Allow public access" apagado en `serenata-erp-test`. Mergeado a `main`
(commit `c56a3c1`) y también asegurado en producción: `SUPABASE_JWT_SECRET`
propio de `serenata-erp` cargado como un segundo valor de la misma variable
en Vercel (scope Production, distinto del de Preview/test) y "Allow public
access" apagado en `serenata-erp` — confirmado sin `JwtSignatureError` en los
logs de Realtime de producción tras el redeploy.

### Fase 2 — Protocolo de mutación y conflictos de Partidas (cerrada)

Objetivo: endurecer `patch_item_cotizacion` con detección de conflicto real
por campo, sin tocar la UI actual (`app/cotizaciones/[id]/page.tsx` sigue
llamando la ruta exactamente igual, sin `base` ni `mutation_id` — eso lo usa
recién el grid nuevo de una fase posterior). Solo Partidas; Información
General y Totales quedan para una fase posterior, junto con la UI del grid.

**Cambios:**
- `db/migrations/20260910_item_cotizacion_revision_conflict.sql`: columna
  `revision` en `items_cotizacion` (se incrementa en cada patch aplicado);
  `patch_item_cotizacion` gana un 4º parámetro opcional `p_base` — sin él,
  sobreescribe igual que siempre (retrocompatible); con él, compara cada
  campo del patch contra el valor base recibido y devuelve
  `{"conflict": {...}}` si alguno no coincide, sin aplicar nada (atómico:
  un conflicto en cualquier campo rechaza la operación completa).
- `app/api/cotizaciones/[id]/items/[itemId]/route.ts`: acepta `base` y
  `mutation_id` opcionales en el body. Un conflicto de la RPC se traduce a
  `409 { error: 'conflict', entity, id, fields }`. Con `mutation_id`, el
  patch corre envuelto en `withIdempotency()` (ya existente, reusado de
  `lib/server/idempotency.ts` — mismo mecanismo que ya usa
  `registrar-pago`), así un retry de red no vuelve a aplicar el patch. El
  recálculo del encabezado corre en su propio try/catch: si falla después
  de que el patch ya se confirmó, no se relanza (evita que un reintento
  legítimo del mismo `mutation_id` dispare un conflicto falso contra su
  propio valor recién escrito). El broadcast (`item_confirmed`) ahora
  incluye `revision` y `mutation_id` en el payload.
- `DELETE` no cambió: un `DELETE` normal ya toma el lock de fila que le
  corresponde, así que corriendo a la vez que un `PATCH` (que usa
  `FOR UPDATE` dentro de la RPC) Postgres serializa las dos transacciones
  sin ventana de carrera — ver el comentario en el propio route.

**Verificado con SQL real contra `serenata-erp-test`** (fila descartable,
limpiada después) antes de tocar el código de la app:
1. Sin `base` → sobreescribe sin comparar, `revision` sube igual (retrocompat).
2. Con `base` correcta → aplica y sube `revision`.
3. Con `base` desactualizada → devuelve `{"conflict": {...}}` exacto, NO
   aplica, `revision` no cambia.
4. Dos campos distintos, cada uno con su `base` correcta → ambos sobreviven.
5. Item inexistente → sigue devolviendo `null` (ruta responde 404 igual que
   antes).

Aplicada y verificada en `serenata-erp-test` y `serenata-erp` (aditivo puro:
agrega columna y agrega una firma nueva de la función, después de tirar
explícitamente la firma vieja de 3 argumentos para no dejar una sobrecarga
ambigua). Unit tests nuevos en
`app/api/__tests__/cotizacion-item-patch-route.test.ts` (16/16, cubren
`base`, conflicto 409, `mutation_id`/idempotencia, y que un fallo del
recálculo de encabezado no relanza). `npx tsc --noEmit`, `npm run lint`
(mismos 9 warnings preexistentes), `npm test` (402/402) y `npm run build`
en verde.

**Mergeado a `main`** (commit `eebe220`, vía PR
[#14](https://github.com/EduardoTerwogt/serenata-erp/pull/14)) y verificado
en el job `live` real de CI dos veces (antes y después del merge, mismo
resultado ambas): `cotizaciones-colaboracion.spec.ts` sigue en 19/23 — el
caso conocido de la línea ~282 sigue fallando por la misma razón de siempre,
sin regresión — y los 4 casos de `realtime-channel-authorization.spec.ts`
(Fase 1) siguen en verde. El cambio de tipo de retorno del RPC (de fila a
`jsonb`) quedó confirmado con el round-trip real Next.js → Supabase, no solo
con mocks. `Test Suite`, `Migrations` y `smoke-and-critical` en verde en
`main`.

---

### Fase 3 — Grid nuevo de Partidas (cerrada)

Objetivo: usar el protocolo de la Fase 2 desde la UI real de
`app/cotizaciones/[id]/page.tsx`, sin tocar Información General ni Totales
(quedan para una fase posterior).

**Rama de trabajo:** esta fase, igual que 0/1/2, vive en
`claude/eloquent-lamport-h7effg` + PR draft (el PR de la fase anterior ya se
mergeó, así que la rama se reseteó desde `origin/main` antes de empezar).

**Bloque 1 — sugerencias de producto atadas a rowId, no a índice:**
`hooks/useQuotationForm.ts` y `hooks/useQuotationItems.ts` keyeaban
`productoSugerencias`/`mostrarProductoDropdown` por índice de array;
insertar, reordenar o borrar una fila movía la sugerencia activa a otra
fila. `seleccionarProducto`/`handleDescripcionChange` ahora reciben el
`rowId` (id estable de la partida) en vez del índice, y lo resuelven a
índice internamente solo para llamar a `setValue`. Afecta también
`useLocalQuotationItems` (pantalla de cotización nueva) y
`app/cotizaciones/[id]/page.tsx` (`handleSelectProduct` ya resolvía el
índice para su propio uso, pero seguía pasándoselo a `seleccionarProducto`
— ahora le pasa el `rowId` directo).

**Bloque 2 — protocolo `base`/`mutation_id` + UI de conflicto por celda:**
- Nuevo `itemsServerRef` (ref, no state) en `page.tsx`: guarda el último
  valor de cada partida confirmado por el servidor — se alimenta desde
  `applyCotizacionToState`, `upsertLocalItemState` (ACK propio o broadcast
  ajeno), `handleAddRow`, `handleImportItems` y la reconciliación de 5s.
  Nunca se pisa con lo que el usuario está tecleando (eso vive solo en el
  form de react-hook-form).
- Al enfocar una celda (`handleItemFieldFocus`) se captura el `base` para
  ESE campo desde `itemsServerRef` y se guarda en `itemCellBaseRef`
  (keyeado por celda, con la misma migración temp→real id que ya tenían
  los demás refs de celda). Sin base conocida (fila recién creada cuya
  alta sigue en vuelo) no se manda `base` — mismo comportamiento
  retrocompatible de siempre, sin conflicto posible.
- `persistItemCellAutosave` manda `base` + un `mutation_id` nuevo
  (`crypto.randomUUID()`) en cada intento. Un 409 de la RPC
  (`ItemPatchConflictError`) NO se trata como error genérico: nunca se
  descarta en silencio lo tecleado por el usuario. Se guarda en
  `itemCellConflicts` (state) y `QuotationItemsSection` pinta un banner
  bajo la celda con dos botones — "Usar «valor del servidor»" (pisa el
  form con lo que hay en la base ahora, sin reintentar guardar) y
  "Mantener «lo tecleado»" (conserva el valor local y reintenta el PATCH
  con el `base` ya corregido al valor que devolvió el conflicto).
- **Alcance deliberado:** el protocolo cubre las 5 celdas de texto/número
  que pasan por `persistItemCellAutosave` (categoria, descripcion,
  cantidad, precio_unitario, x_pagar). `handleSelectProduct` (elegir
  producto de la lista) y `handleResponsableChange` (`<select>` de
  responsable) siguen aplicando de inmediato sin `base`, igual que antes
  — son acciones de un solo paso, no una sesión de tecleo con ventana de
  carrera real, y añadir el protocolo ahí queda para si se decide que vale
  la pena en una iteración posterior.
- `hooks/useQuotationItems.ts`: `QuotationItemsController` gana
  `getCellConflict`/`resolveCellConflict`; `useLocalQuotationItems`
  (cotización nueva, sin servidor aún) los implementa como no-op — no
  puede haber conflicto real sin PATCH.

**Bloque 3 — consumir `item_confirmed`/`general_confirmed`/`totales_confirmed`:**
`useQuotationPresence.ts` ya escuchaba 5 eventos de broadcast, todos
browser→browser sin acuse; ahora suma 3 listeners para los eventos que
manda el SERVIDOR justo después de comprometer el PATCH en Postgres (ver
`lib/server/realtime/broadcast.ts` y las 3 rutas). `page.tsx` los usa como
señal para reconciliar de inmediato en vez de esperar el heartbeat de 5s
— nunca lo reemplazan, solo lo adelantan. `item_confirmed` trae
`mutation_id`; el cliente que generó ese id (guardado en
`ownItemMutationIdsRef`, un `Set` acotado a 50 entradas) reconoce su
propia confirmación y no reconcilia de más — ya aplicó el resultado al
recibir la respuesta de su propio PATCH. `general_confirmed`/
`totales_confirmed` no llevan forma de distinguir autor, así que toda
confirmación (propia o ajena) dispara la reconciliación; inofensivo,
solo repite una lectura que de todas formas iba a pasar en el próximo
heartbeat. El mecanismo viejo (`item_mutation`/`broadcastItemMutation`,
browser→browser sin acuse) sigue intacto: esto es un convergence signal
adicional, no un reemplazo.

**Verificado:** `npx tsc --noEmit`, `npm run lint` (mismos warnings
preexistentes) y `npm test` (402/402) en verde en local en cada bloque.
`npm run build` y `test:e2e:*` no se pudieron correr en este sandbox —
el contenedor de esta sesión no tenía `.env.local` con los secretos de
la app (`AUTH_SECRET`, Supabase, etc.), a diferencia de sesiones
anteriores de esta misma iniciativa; se verificó en su lugar vía CI real
en el PR draft [#15](https://github.com/EduardoTerwogt/serenata-erp/pull/15):
`E2E` (`smoke-and-critical`, que sí corre el build) y `Migrations` en
verde para el commit final. El job `live` (disparado manualmente, ver
[comentario en el PR](https://github.com/EduardoTerwogt/serenata-erp/pull/15#issuecomment-5612357483))
dio 19/23 — el mismo caso conocido de la línea ~282 sigue fallando por
la misma razón de siempre (badge de presencia por sección, `channel.send()`
cae a REST con 403 silencioso), sin regresión; los 3 suites nuevos de
esta iniciativa (`realtime-channel-authorization`, concurrencia de
cuentas por cobrar/pagar, smoke básico) pasaron completos.

**Mergeada a `main`** vía PR
[#15](https://github.com/EduardoTerwogt/serenata-erp/pull/15) (commit
`090f507`), y confirmada en verde real tras el merge: `Test Suite` y
`Migrations` en verde sobre `main`; `E2E` con el mismo resultado de
siempre (19/23 en `cotizaciones-colaboracion.spec.ts`, mismo caso
conocido de la línea ~282, sin regresión) — igual que en el PR y que en
los merges de las Fases 1 y 2.

---

### Fase 4 — El grid no pierde capacidades existentes (cerrada)

Objetivo: demostrar que el grid nuevo de Partidas (Fase 3) no perdió
ninguna capacidad de captura que el usuario ya tenía. La mayoría de
estas capacidades ya existían antes de esta iniciativa; esta fase es
sobre todo verificación, no funcionalidad nueva.

**Hallazgo de arranque:** ninguna de las 3 capacidades más directamente
tocadas por Fase 3 (combobox de producto, cambio de responsable, copiar
partidas de otra cotización) tenía cobertura e2e — un cambio ahí podía
romperse sin que ningún test lo detectara. Se cerraron los tres huecos:

- `tests/e2e/critical/cotizaciones-editar.spec.ts`: nuevo test
  "seleccionar una sugerencia de producto autocompleta categoría, precio
  y x_pagar" — confirma que el combobox de Descripción sigue mandando
  un solo PATCH atómico con los 4 campos, ahora que usa `rowId` en vez
  de índice (Fase 3, Bloque 1).
- Nuevo test "cambiar el responsable de una partida persiste el
  cambio" — `handleResponsableChange` no lo tocó Fase 3, pero tampoco
  tenía cobertura.
- Nuevo test "copiar partidas seleccionadas desde otra cotización las
  trae a la actual" — ejercita `QuotationCopyItemsModal` de punta a
  punta (buscar, elegir cotización origen, elegir partidas, importar).
  Confirma que sigue funcionando sobre el mismo `handleImportItems` ya
  probado por las plantillas.
- `tests/e2e/utils/quotation-detail-mocks.ts` gana las opciones
  `productos`/`responsables` para fijar el catálogo mockeado por test
  (antes siempre vacío o de un solo responsable fijo).

**Fix de CI pedido por el usuario, no parte del plan original:** el job
`live` (único nivel que prueba contra Supabase/Drive de prueba reales)
corría solo en `push` a `main` o por `workflow_dispatch` manual —nunca
en PR, a propósito, para no exponer secretos de prueba a "ramas
externas". Ese riesgo no aplica: este repo es privado, sin
colaboradores externos, y son credenciales de `serenata-erp-test`, no
de producción. Sin este fix, cada rama/PR de esta iniciativa necesitaba
que alguien disparara `live` a mano, porque la integración de GitHub de
Claude Code no tiene permiso de `workflow_dispatch`/`rerun-failed-jobs`
(403 verificado repetidas veces). Ahora `e2e.yml` también corre `live`
en `pull_request` — verificado en vivo en
[PR #16](https://github.com/EduardoTerwogt/serenata-erp/pull/16): el
job corrió solo, sin intervención manual, por primera vez.

**Verificado:** con las mismas env vars fake que ya usa el job
`smoke-and-critical` de CI (no son secretos reales, están en el propio
`e2e.yml`), se pudo correr localmente por primera vez en esta sesión:
`npm run build`, `npm run test:e2e:smoke` (21/21) y
`npm run test:e2e:critical` (48/48, incluidos los 3 tests nuevos) —
verde. `npx tsc --noEmit`, `npm run lint` (mismos warnings
preexistentes) y `npm test` (402/402) también en verde.

**Mergeada a `main`** vía PR
[#16](https://github.com/EduardoTerwogt/serenata-erp/pull/16) (commit
`26b5a2c`). `Test Suite` y `Migrations` en verde sobre `main`. `E2E`
mostró dos fallos, ninguno regresión de esta fase:
- `live`: el caso conocido de siempre (línea ~282), sin cambios.
- `smoke-and-critical`: `planeacion.spec.ts` ("extracción IA...") falló
  por timeout esperando un redirect -- un módulo que esta iniciativa
  nunca tocó. Prueba de que es inestabilidad de CI y no una regresión:
  el mismo commit, sin ninguna diferencia de código, ya había pasado
  48/48 en el PR minutos antes.

**Deuda nueva a vigilar** (efecto colateral del fix de `live` en PR,
no de esta fase en sí): correr `live` en cada push (PR + `main`) subió
la frecuencia de golpes reales contra la cuota de la API de Google
Drive del proyecto de prueba -- ya se vio un `403 User rate limit
exceeded` al crear una carpeta en Drive durante iteración rápida. Si se
vuelve frecuente, considerar espaciar los pushes que disparan `live` o
agregar retry/backoff específico para ese caso en el propio test.

### Fase 5 — Información General y Totales con protocolo base/conflict (cerrada)

Objetivo del plan: "quitar locks de sección y pasar a campos
independientes" en Información General (cliente, proyecto, fecha de
entrega, locación) y Totales (fee, IVA, tipo/valor de descuento).

**Bug de correctness encontrado antes de tocar nada (prioridad sobre
Presence):** `persistGeneralAutosave`/`persistTotalsAutosave` mandaban
SIEMPRE la sección completa (los 4 campos) en cada PATCH, comparando
contra una foto de "última guardada" de toda la sección, no campo por
campo -- a pesar de que la RPC y la ruta ya soportaban parches
parciales de verdad. Dos ediciones concurrentes a campos *distintos* de
la misma sección (A edita Fecha, B edita Locación) podían pisarse en
last-writer-wins silencioso, exactamente lo que el criterio de salida
del plan pide que nunca pase. Se corrigió de raíz, no se parchó el
síntoma.

**Base de datos:** migración
`db/migrations/20260910_cotizacion_general_totales_revision_conflict.sql`
-- mismo patrón que `patch_item_cotizacion` (Fase 2): columna
`revision` en `cotizaciones`, y `patch_cotizacion_general`/
`patch_cotizacion_totales` ganan un tercer parámetro `p_base jsonb
default null`; sin "base" siguen sobreescribiendo igual que siempre
(retrocompatible). Con "base", comparan campo por campo contra la fila
bajo `FOR UPDATE` y devuelven `{"conflict": {...}}` si algo cambió
desde que el cliente leyó ese campo. Aplicada y verificada con SQL real
contra `serenata-erp-test` y producción (incluida una prueba de
conflicto real sobre la fila `SH004`, restaurada a sus valores
originales después).

**Rutas:** `general/route.ts` y `totales/route.ts` ahora leen `base`
del body, se lo pasan a la RPC, y responden `409 {error: 'conflict',
entity, id, fields}` cuando la RPC devuelve un conflicto -- mismo
contrato que ya usa la ruta de partidas.

**Cliente (`app/cotizaciones/[id]/page.tsx`):** rediseño de autosave de
sección completa a campo por campo, mismo patrón que ya probó Fase 3
para celdas de Partidas:
- `generalServerRef`/`totalsServerRef`: última foto confirmada por el
  servidor por sección (reemplaza a los antiguos
  `lastSavedGeneralRef`/`lastSavedTotalsRef`, que conflaban "confirmado
  por el servidor" con "lo último que mandé yo").
- Un `Set` de campos sucios, un timer de autoguardado y un "base" por
  campo (no por sección) para General y para Totales.
- `patchQuotationGeneral`/`patchQuotationTotales`: `fetch` crudo (no
  `sendJson`/`getJson`, que colapsan cualquier respuesta no-2xx en un
  `Error` genérico y perderían el payload `{fields}` del 409) --
  reemplazan a `saveQuotationGeneral`/`saveQuotationTotals`, que se
  borraron de `quotation-service.ts` por quedar sin caller.
- `PatchConflictError` (renombrado desde `ItemPatchConflictError`, que
  ya no era específico de partidas) y `FieldConflictDetail` (desde
  `ItemFieldConflictDetail`) ahora son genéricos y los comparte
  Partidas/General/Totales.
- Banner de conflicto igual al de Partidas ("Usar 'X'" / "Mantener
  'Y'"), agregado a `QuotationGeneralInfoSection` y
  `QuotationTotalsPanels` como props opcionales `conflicts`/
  `onResolveConflict` -- nunca se descarta en silencio lo que el
  usuario tecleó.
- Corrección secundaria (parte del mismo objetivo "quitar locks de
  sección"): `applyGeneralOnly`/`applyTotalsOnly` antes se saltaban LA
  SECCIÓN COMPLETA si cualquier campo estaba sucio; ahora protegen
  campo por campo (mismo criterio que `isCellBusy` en Partidas), así
  que refrescar el campo de otro colaborador ya no espera a que el
  usuario termine de editar uno propio en la misma sección.
- El lock de sección para Presence (badge "X está editando esta
  sección") se mantiene sin cambios -- Presence por campo individual
  queda fuera de alcance de esta fase porque `QuotationGeneralInfoSection`
  y `QuotationTotalsPanels` solo exponen focus/blur a nivel de sección;
  ampliarlo requeriría además re-cablear esos componentes hijos, igual
  que Fase 3 dejó fuera de alcance el protocolo de conflicto para
  `handleSelectProduct`/`handleResponsableChange`.

**Verificado:** `npx tsc --noEmit`, `npm run lint` (mismos warnings
preexistentes) y `npm test` (406/406, incluidos 4 tests nuevos de
base/conflicto en `cotizacion-secciones-route.test.ts`) en verde. Con
las env vars fake de CI: `npm run build`, `npm run test:e2e:smoke`
(21/21) y `npm run test:e2e:critical` (48/48) en verde -- sin cambios
de comportamiento en ningún flujo existente.

El criterio de salida del plan ("A edita Fecha y B Locación
simultáneamente -> ambos sobreviven") ya tenía cobertura en
`tests/e2e/live/cotizaciones-colaboracion.spec.ts` ("estar en una
sección la señala pero no impide que el otro escriba en ella") --
sigue el mismo caso conocido de la Fase 0 (badge de presencia, no
pérdida de datos) y corre automáticamente en el job `live` de CI desde
el fix de Fase 4.

**Mergeada a `main`** vía PR
[#17](https://github.com/EduardoTerwogt/serenata-erp/pull/17) (commit
`9f35b14`). Confirmado en verde tras el merge (run
[34440891955](https://github.com/EduardoTerwogt/serenata-erp/actions/runs/34440891955)):
`Test Suite` y `Migrations` en verde; `E2E` con `smoke-and-critical`
verde y `live` con el mismo fallo conocido de siempre en
`cotizaciones-colaboracion.spec.ts:282` (badge de presencia), sin el
403 de rate-limit de Drive visto en el push de Fase 4 -- nada nuevo que
vigilar.

### Fase 6 — Retirada de arquitectura antigua (alcance conservador, PR #18 -- REABIERTA)

> **Reabierta.** El usuario no consideró cerrada la Fase 6 con este alcance
> conservador -- el PR #18 fue una limpieza válida (se conserva, no se
> revierte) pero no el cierre de la fase. Todo lo que esta sección describe
> como "diseño actual" (`item_mutation`/`broadcastItemMutation` cliente→cliente,
> `TEMP_ROW_PREFIX`/`migrateRowKeys`, el heartbeat de 5s como garantía
> primaria) se retiró o se está retirando en las sub-fases 6A-6F que siguen a
> esta sección. Se deja el registro histórico tal cual se escribió, para no
> reescribir lo ya pasado, pero **no es** el diseño vigente -- ver más abajo
> el cierre real de la Fase 6.

Objetivo del plan: "reducir complejidad, no dejar dos motores vivos" --
eliminar broadcasts de negocio del cliente, reconciliación vieja,
polling fijo si ya no hace falta, temp IDs/migradores, simplificar
`useQuotationPresence`, y código muerto.

**Decisión de alcance, confirmada con el usuario antes de tocar nada:**
investigar primero mostró que la mayoría de lo que el plan llama
"arquitectura antigua" ya dejó de ser insegura/no-autoritativa en las
Fases 1-5 de esta misma iniciativa, no algo heredado de antes:

- El canal ya es privado y autenticado (Fase 1) -- ya no es el problema
  original ("cualquiera con la anon key se une a cualquier cotización").
- `item_mutation`/`section_signal`/`item_cell_signal` (broadcast
  cliente→cliente) ya están documentados en el propio código, desde
  Fase 3, como "solo una pista para verse al instante" -- la única
  garantía real de convergencia es `reconciliarConServidor()` (gatillada
  por los eventos `*_confirmed` del servidor) más el heartbeat de 5s.
  Esto YA es el diseño nuevo, no un fallback oculto al motor viejo.
- El heartbeat de 5s **no es legacy**: es la garantía de convergencia
  explícitamente documentada (`useQuotationPresence.ts`: "El polling de
  5s en la pantalla de detalle sigue siendo la garantía real de
  convergencia, no este canal"). Quitarlo violaría ese invariante, no lo
  simplificaría.
- Temp IDs/migradores (`TEMP_ROW_PREFIX`, `migrateRowKeys`) tampoco son
  legacy: son el mecanismo actual de UI optimista para filas nuevas (el
  POST es async, la fila se pinta antes de que responda). No hay una
  alternativa más simple sin cambiar el comportamiento.

Retirar de verdad los broadcasts de negocio (dejar que TODO cambio ajeno
se entere solo por reconciliación/fetch) es posible pero cambia la UX
perceptible -- los cambios de otro colaborador tardarían un round-trip
de fetch en vez de verse al instante -- y obliga a revalidar varios
tests `live` ya afinados a esa velocidad. Se le presentó esta disyuntiva
al usuario (conservador vs. agresivo) y eligió **conservador**: no tocar
UX ni el modelo de convergencia, solo limpiar lo que sea código muerto
de verdad.

**Código muerto encontrado y eliminado** (el único remanente real de
"dos motores" -- una función completa que nunca se activaba):
`lockItemRow`/`releaseItemRow` y toda la señal `item_row_signal` en
`hooks/useQuotationPresence.ts` no los invocaba nadie en todo el repo
-- `itemRowEditors` quedaba siempre `{}` en producción, así que
`isItemRowLocked`/`isRowBusy` siempre devolvían `false`. Era un
"row lock" diseñado pero jamás cableado a ninguna acción de UI. Se
retiró por completo: tipo `QuotationItemRowMode`, interfaz
`QuotationItemRowEditor`/`ItemRowSignalPayload`, el estado
`itemRowEditors`, el reducer case, `sendItemRowSignal`, el listener del
canal, y `isRowBusy` de `QuotationItemsController` (interfaz +
las 2 implementaciones + su uso en `QuotationItemsSection.tsx`). Cero
tests lo referenciaban. Sin cambio de comportamiento: `isRowBusy`
siempre devolvía `false`, así que las clases condicionales que dependían
de él nunca se aplicaban.

**Criterio de salida del plan** ("el nuevo sistema funciona sin fallback
oculto al motor viejo"): cumplido -- no queda ningún camino donde un
fallo de autenticación/autoridad del canal privado (Fase 1) o del
protocolo base/conflict (Fase 2/3/5) deje a la app dependiendo en
silencio del canal público o de un broadcast tratado como fuente de
verdad. Lo que sigue vivo (broadcasts como pista + heartbeat de 5s) es
diseño actual, documentado, no un remanente oculto.

**Verificado:** `npx tsc --noEmit`, `npm run lint` (mismos warnings
preexistentes) y `npm test` (406/406) en verde. Con las env vars fake
de CI: `npm run build`, `npm run test:e2e:smoke` (21/21) y
`npm run test:e2e:critical` (48/48) en verde -- sin cambios de
comportamiento en ningún flujo existente.

**Mergeada a `main`** vía PR
[#18](https://github.com/EduardoTerwogt/serenata-erp/pull/18) (commit
`c94b764`). `Test Suite` y `Migrations` en verde. `E2E` mostró 2
fallos, ninguno regresión de esta fase:
- `live`: el caso conocido de siempre (línea ~282), sin cambios.
- `smoke-and-critical`: `planeacion.spec.ts` ("extracción IA...") falló
  por el mismo timeout de siempre esperando el redirect -- exactamente
  el mismo síntoma ya documentado en el push de Fase 4, en un módulo
  que esta iniciativa tampoco tocó en esta fase. Mismo commit había
  pasado 48/48 en el PR minutos antes: inestabilidad de CI, no
  regresión. Segunda vez que se ve este flake específico -- si
  reaparece una tercera, vale la pena investigar por qué justo ese test
  es el que more flakea (¿carga del runner al final de la suite?, ¿algo
  del propio test?) en vez de seguir tratándolo caso por caso.

### Fase 6 (reabierta) — cierre real: modelo único server-authoritative (6A-6F)

El usuario no aceptó la sección anterior como el cierre de la Fase 6: el PR
#18 fue una limpieza válida (se conserva), pero varios de los mecanismos que
esa sección documentaba como "diseño actual, no remanente oculto" --
`item_mutation` cliente→cliente, IDs temporales con `migrateRowKeys`, el
heartbeat de 5s como única garantía real -- eran justo lo que había que
retirar. Se redefinió el alcance completo y se ejecutó en 6 sub-fases
secuenciales sobre la misma branch, cada una verificada localmente antes de
la siguiente.

**Regla que gobierna todo lo que sigue:** PostgreSQL es la única fuente de
verdad. Todo cambio de datos va `usuario → mutación API/RPC → PostgreSQL
confirma → el SERVIDOR emite un evento Realtime confirmado (identidad +
revisión, nunca el dato completo) → los demás clientes releen contra la
API`. Ningún navegador le manda a otro un dato de negocio para que lo
persista o decida un conflicto. Lo único que viaja navegador→navegador es
Presence (awareness efímera: quién está conectado, en qué sección, sobre
qué celda) -- nunca guarda datos, nunca hace merge, nunca decide
conflictos, nunca bloquea.

**6A -- eventos server-confirmed para las mutaciones que no los tenían.**
`POST /items` (alta), `DELETE /items/:itemId` (baja) y `POST /items/bulk`
(importar/copiar) ganan `item_confirmed` con un campo `operation` nuevo
(`'create' | 'update' | 'delete' | 'bulk'`, ausente = `'update'` por
compatibilidad). `PATCH /notas` gana `notas_confirmed`, mismo patrón que
`general_confirmed`/`totales_confirmed` (vivos desde Fase 1/5). El listener
de `item_confirmed` ya disparaba una reconciliación completa sin importar
la operación, así que create/delete/bulk no necesitaron ningún cambio de
cliente -- solo Notas, que antes no tenía ningún evento confirmado.

**6B -- IDs estables desde el nacimiento de la fila.** Cada fila nace con
un UUID generado en el CLIENTE (`crypto.randomUUID()`) y esa es su
identidad para siempre; `POST /items` lo acepta y valida (con fallback a
generarlo en servidor). Retry con el mismo id no duplica ni re-emite el
evento (el id ya existente hace de llave de idempotencia). Esto elimina
por completo el modelo de dos fases "id temporal → id real":
`TEMP_ROW_PREFIX`, `migrateRowKeys` (el remapeo de ~6 refs de tracking por
celda) y `pendingRowIdsRef`/`resolveRowId` desaparecen, reemplazados por
`pendingRowCreationsRef`/`awaitRowCreation`, que solo esperan a que el
alta termine -- no traducen identidad, porque ya no hay que traducirla.

**6C -- base/conflict para seleccionar producto y cambiar responsable.**
Estas dos operaciones aplicaban su patch sin "base", así que siempre
pisaban en silencio una edición concurrente sobre los mismos campos (el
caso que describió el usuario: alguien edita Precio mientras otro
selecciona un producto cuyo autofill también toca Precio). Ahora mandan
base de los 4 campos que el autofill toca (o de `responsable_id`), con
`mutation_id`, y son atómicas -- si cualquier campo está desactualizado,
`patch_item_cotizacion` (ya atómica desde Fase 2) rechaza la operación
completa. El conflicto reusa el banner por celda que ya existía para el
autoguardado normal: no hizo falta UI nueva, y el usuario elige "mine"
(reintenta con base corregida) o "theirs" (adopta el valor del servidor).

**6D -- eliminar `item_mutation` navegador→navegador.** Con 6A + 6B dando
cobertura completa de eventos server-confirmed, el único camino que
quedaba donde un navegador le mandaba a otro la partida completa
directamente (sin pasar por Postgres) se retira entero: tipos, estado,
reducer, la función `broadcastItemMutation` y su listener, y las 6 llamadas
repartidas en autoguardado, alta, importar, borrar, seleccionar producto y
cambiar responsable.

**6E -- Presence solo-awareness + retirar el polling como garantía
primaria.** `section_signal`/`item_cell_signal` (broadcast aparte para
"quién edita qué sección/celda") y `section_saved` (aviso de guardado
ajeno, redundante con los eventos `*_confirmed`) se retiran. Presence pasa
a ser UN solo mecanismo: cada cliente hace `channel.track()` con
`{user_id, name, active_section, entity_id, field, online_at}` y Supabase
sincroniza ese registro a todos -- `sectionEditors`/`itemCellEditors` se
derivan directo de ahí. Esta no es solo una simplificación: es la
corrección de raíz del test live que fallaba de forma intermitente desde
Fase 0 (`cotizaciones-colaboracion.spec.ts`, "está editando esta sección").
La causa, ya documentada en el repo, era que `channel.send()` (broadcast)
cae a REST con 403 silencioso cuando el canal no terminó de unirse --
exactamente el transporte que usaban `section_signal`/`item_cell_signal`.
`channel.track()` (Presence) no comparte ese modo de falla. El heartbeat de
reconciliación deja de ser la garantía primaria (ahora lo son los 4
eventos `*_confirmed` + reconectar el canal + volver a la pestaña, todos
disparando una reconciliación inmediata) y se hizo deliberadamente menos
frecuente (5s → 20s) como red de última instancia, justificada y probada:
dos tests ejercen esa red sin ningún aviso de por medio y siguen en verde
con el intervalo nuevo, y uno nuevo prueba que volver a la pestaña
converge sin necesidad de que el heartbeat llegue a dispararse.

**6F -- separar Presence de datos-confirmados, documentar y cerrar.**
`useQuotationPresence` mezclaba awareness (Presence) con eventos
confirmados del servidor en un solo reducer. Se separó en dos reducers
independientes (`awarenessReducer`/`confirmedEventsReducer`), cada uno con
su propio estado y ciclo de vida, compartiendo el mismo canal por
eficiencia (un solo join por cotización) pero sin leer el estado del otro
-- la separación conceptual que pedía el plan, sin forzar dos hooks que
tuvieran que coordinar quién crea/destruye el canal (riesgo real de doble
join o de listeners perdidos entre hooks hermanos, evaluado y descartado).
`reconciliarConServidor` no se reescribió a fondo: su complejidad real
(IDs temporales, datos empujados por otro navegador) ya se había retirado
en 6B/6D: lo que queda (`celdaOcupada`, `escrituraLocalPosterior` vía
`localWriteAtRef`, `conservarLocal` vía `pendingRowCreationsRef`) sigue
siendo necesario, no legacy.

**Qué representa Presence ahora:** awareness pura, nunca datos. Nunca
guarda nada, nunca hace merge, nunca decide un conflicto, nunca bloquea
una edición -- si alguien más "tiene" una sección o celda señalada, quien
escribe ahí igual puede escribir y guardar; la señal es solo informativa.

**Camino autoritativo de cada mutación (partidas, general, totales,
notas):** `usuario edita → PATCH/POST/DELETE con base+mutation_id cuando
aplica → RPC atómica en Postgres (conflicto por campo si la base no
coincide) → si confirma, el servidor emite `*_confirmed` (identidad +
revisión, nunca el dato) → los demás clientes reconcilian releyendo la API
→ RHF/FieldArray solo pinta lo que la reconciliación ya decidió`.

**Qué garantiza la convergencia:** los eventos `*_confirmed` (server-
confirmed, primarios), reconectar el canal, volver a la pestaña, y un
heartbeat de 20s como red de última instancia -- nunca la fuente primaria.

**Legacy que queda, y por qué:** RHF/`useFieldArray` siguen siendo el
motor del formulario de partidas (el plan no pedía retirarlos, solo que no
decidan verdad colaborativa -- y no la deciden: solo pintan lo que
`reconciliarConServidor` ya resolvió). `LOCAL_ROW_PREFIX`/`newLocalRowId`
en `useQuotationItems.ts` siguen vivos -- son de la pantalla de "cotización
nueva, todavía sin guardar en la base", un flujo sin servidor ni
colaboración, fuera del alcance de esta iniciativa.

**Tests nuevos/actualizados en esta iniciativa (6A-6F):** unitarios para
cada evento confirmado nuevo y el contrato de id estable (6A/6B); dos
aserciones nuevas sobre el "base" que mandan producto/responsable (6C,
crítico); reescritura del test de "fila ajena no roba el foco" sobre
`item_confirmed` en vez de `item_mutation` (6D); `emitPresence()` nuevo en
el mock de Realtime + reescritura de los tests de presencia/guardado-ajeno
sobre Presence real en vez de `section_signal`/`section_saved` (6E); test
nuevo de convergencia por `visibilitychange` sin heartbeat (6F). Se retiró
un test ("un guardado ajeno no provoca una relectura de la cotización")
que afirmaba justo la propiedad opuesta a la que el diseño nuevo persigue
a propósito -- una relectura completa en cada confirmación, no una
optimización para evitarla.

**Cobertura live no añadida en esta pasada, con justificación:** los 12
escenarios mínimos que pidió el usuario están cubiertos en su mayoría por
la suite live ya existente (`cotizaciones-colaboracion.spec.ts`, ver más
abajo) más lo nuevo de 6A-6F a nivel crítico/unitario. Dos escenarios
concretos -- conflicto por mismo campo con 409 en vivo, y seleccionar
producto/cambiar responsable contra una edición concurrente EN VIVO (el
caso de ejemplo exacto del usuario) -- no ganaron un test `live` nuevo en
esta pasada: requieren sembrar catálogos reales (productos/proveedores) en
`serenata-erp-test` y no podían verificarse localmente, solo vía CI con
varios ciclos de ida y vuelta. Se documenta como pendiente explícito para
la Fase 7 (que de por sí amplía la prueba en vivo a más usuarios y
escenarios), no como brecha silenciosa.

Ver el mensaje de PR/merge de cada sub-fase para el detalle línea por línea
de cada cambio y su verificación local.

**Cierre real, con los 3 bugs que aparecieron llevando el PR a verde (ninguno
visible en local, los tres encontrados y arreglados sobre datos/CI reales):**

1. **Conflicto de merge genuino en el PR.** La branch traía un commit
   pre-squash (`6ad957a`, contenido idéntico al squash-merge `53e87ff` que ya
   estaba en `main`, ambos hijos del mismo padre) que producía un conflicto
   real de 3-way merge pese a que los árboles eran idénticos en contenido.
   Se resolvió con `git rebase --onto origin/main 6ad957a <tip>` (deja caer
   el commit duplicado, replica solo lo neto-nuevo) y se confirmó sin
   conflicto vía `git merge-tree` antes de forzar el push. Esto también
   explicó por qué CI había dejado de dispararse en varios pushes previos.
2. **`patch_cotizacion_general`/`totales`/`patch_item_cotizacion` rechazaban
   con 409 un guardado sin conflicto real.** `to_jsonb(fila) -> campo` para
   una columna SQL NULL no devuelve SQL NULL -- devuelve el jsonb `'null'`,
   así que `coalesce()` nunca sustituía y el chequeo de conflicto comparaba
   `null` contra `""` como si fueran valores distintos. Se reprodujo en vivo
   contra `serenata-erp-test` vía el MCP de Supabase (fila de prueba
   `SH-DEBUG-TEST-1`, creada y borrada después de verificar) antes de
   confiar en el fix. Corregido con una función auxiliar
   (`jsonb_null_as_empty_string`) que normaliza `'null'::jsonb` a `'""'`
   explícitamente -- migración
   `db/migrations/20260910_fix_null_vs_empty_conflict_false_positive.sql`,
   aplicada a `serenata-erp-test` y `serenata-erp` (aditiva, `create or
   replace function`).
3. **El canal de Presence podía caer a `CLOSED` sin que nada lo
   reconectara.** Confirmado con evidencia directa de log de CI (no
   supuesto): tras dos corridas de `live` seguidas fallando en el mismo
   badge de sección pese a reintentos de `track()`, se agregó logging
   explícito al estado del canal y la siguiente corrida mostró
   `[useQuotationPresence] canal de Realtime perdió la conexión CLOSED`
   para ambos colaboradores, minutos antes de que corriera el test --
   nada volvía a llamar `channel.subscribe()`. La ruta de datos no lo
   sufría porque `RECONCILIACION_MS` es un poll de 20s independiente del
   canal; Presence no tenía ningún respaldo así. Fix real:
   `hooks/useQuotationPresence.ts` reconecta (backoff 1s/2s/4s/8s, tope
   10s) cuando el canal entra en `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`,
   reusando la misma autorización y los mismos 5 listeners.

**Resultado final, verificado dos veces en `live` real (no solo en local):**
`cotizaciones-colaboracion.spec.ts` **9/9 en verde**, incluido el caso de la
línea ~282 que era conocido desde la Fase 0. `smoke-and-critical` y
`Migrations` también en verde. Mergeado a `main` (squash) como
[PR #20](https://github.com/EduardoTerwogt/serenata-erp/pull/20), commit
`0b3cea3`. Confirmado en verde **sobre el propio push a `main`** (no solo en
el PR): `Test Suite`, `Migrations` y `E2E` (los dos jobs, `live` y
`smoke-and-critical`) los tres en success sobre `0b3cea3`.

**Desviación del plan original y su justificación:** el plan de Fase 6
reabierta no anticipaba estos 3 bugs porque ninguno era visible sin CI/datos
reales -- el conflicto de merge solo aparece al abrir el PR contra el
`main` real, el bug de NULL-vs-"" solo se dispara con una columna que nunca
tuvo valor (no cubierto por los datos de prueba unitarios existentes), y el
canal caído es un modo de falla de infraestructura de Realtime bajo CI que
ningún mock reproduce. Los tres se diagnosticaron con causa raíz verificada
(rebase + `merge-tree`, reproducción directa por SQL, logging + 2 corridas
de log de CI) antes de aplicar cada fix, siguiendo la misma disciplina de
"no adivinar, medir" que ya regía el resto de esta iniciativa.

### Fase 7 — Pruebas de escalamiento multiusuario (cerrada)

Generaliza `cotizaciones-colaboracion.spec.ts` (2 usuarios) a N sesiones
concurrentes reales contra Supabase/Realtime de prueba. Nuevo archivo:
`tests/e2e/live/cotizaciones-colaboracion-escala.spec.ts`, recogido por el
mismo job `live` sin cambios de workflow. No mide throughput ni latencia --
es correctitud a escala: N participantes (1 del entorno + hasta 9
sembrados) abren la misma cotización con N items, cada uno edita SU PROPIO
item a la vez que todos los demás vía `Promise.all`, y se verifica (1) que
cada pantalla ve exactamente a las N-1 restantes en "Colaborando ahora"
(conteo exacto, no solo "no estoy solo"), (2) que el servidor -- autoridad
real -- termina con las N escrituras sin perder ninguna, y (3) que la
reconciliación converge en TODAS las pantallas, no solo en quien escribió.

**Resultado, primera corrida en CI real (PR #21, mergeado como `824590e`):
las 4 variantes pasaron limpio, sin ningún reintento ni fix necesario** --
2 sesiones en 9.3s, 3 en 10.3s, 5 en 15.3s, 10 en 27.5s, escalando de forma
predecible con N y sin ninguna escritura perdida ni colaborador invisible
en Presence a ninguna escala. Confirma en vivo que el cierre de Fase 6
(protocolo base/conflict + Presence con reconexión automática del canal)
aguanta hasta 10 conexiones simultáneas al mismo canal `cotizacion:{id}`
sin degradarse. `Test Suite`, `Migrations` y `E2E` (los dos jobs) en verde
también sobre el push a `main`, no solo en el PR.

### Fase 8 — Hardening pre-Proyectos (cerrada)

Antes de replicar el patrón de colaboración en tiempo real de Cotizaciones
en Proyectos, se hizo una auditoría crítica de 9 puntos (3 agentes de
exploración en paralelo + verificación propia, cada hallazgo citado con
archivo+línea). Confirmó que la arquitectura de fondo (Postgres como única
fuente de verdad, mutaciones granulares con `base`/`FOR UPDATE`/409, IDs
estables, Presence solo-awareness, canal privado autorizado) estaba bien,
pero encontró 6 correcciones puntuales reales -- ninguna requería
rediseñar nada, todas eran fixes locales dentro del modelo ya aprobado:

1. **PUT completo (`save_cotizacion`) en Generar/Aprobar** -- la única
   carrera de este lote capaz de perder datos con dos usuarios legítimos
   sin nada raro de por medio. `aprobar()`/`generarCotizacion()` llamaban
   primero al PUT completo (sin comparar `revision` ni `base` contra
   nada), pudiendo revertir en silencio una partida que otro colaborador
   acababa de guardar por PATCH. Fix: `flushPendingSaves()` (espera las
   mutaciones PATCH que ya estaban en vuelo en el momento del click, sin
   convertirse en una cola global) + relectura canónica + la RPC de
   transición que corresponde -- `approve_cotizacion` (ya existía,
   transaccional, no hacía falta ninguna RPC nueva) para Aprobar, y la
   nueva `emitir_cotizacion` (mismo patrón `FOR UPDATE` que el resto)
   para BORRADOR→EMITIDA, que no existía como transición dedicada.
2. **Evento `item_confirmed` con `item_id: null` (operación `bulk`)
   descartado antes del reducer** -- el import masivo de otro colaborador
   nunca disparaba reconciliación inmediata por Realtime, solo por el
   poll de 20s (la red de seguridad, no el camino primario). Fix de una
   línea: aceptar `item_id: null` cuando `operation === 'bulk'`.
3. **Tres fugas reales de lifecycle en la reconexión de Realtime**,
   confirmadas con evidencia directa de log de CI, no supuestas:
   - `cannot add presence callbacks after joining a channel` SÍ era real
     (root cause en el código fuente de `@supabase/realtime-js`:
     `RealtimeClient.channel()` reusa el objeto de canal existente para
     el mismo topic si `removeChannel()` -- async -- no terminó todavía;
     `scheduleReconnect()` llamaba `connect()` sin esperarlo).
   - Cadenas de refresco de token huérfanas (cada reconexión dejaba viva
     una adicional, nunca cancelada hasta el unmount final).
   - Timeouts de reintento de `trackPresence` sin cancelar en cleanup.
4. **Colisión de UUID cruzado en `items_cotizacion`** -- `upsertItems()`
   hacía un `.upsert()` genérico sin `WHERE cotizacion_id`, así que un
   UUID reusado (deliberado o por un bug futuro) entre cotizaciones
   distintas podía secuestrar la fila completa de la otra vía
   `ON CONFLICT DO UPDATE`. `save_cotizacion` ya resolvía esto
   correctamente; se extrajo el mismo patrón a una RPC nueva
   (`upsert_items_cotizacion`) para que ambas rutas de alta la usen.
5. **RLS: el navegador solo puede Presence, nunca Broadcast** -- nada en
   el código emite `channel.send({type:'broadcast'})` desde el navegador
   desde Fase 6D, pero la política de INSERT sobre `realtime.messages`
   seguía permitiendo ambas extensiones para cualquier staff autorizado.
   Ahora el INSERT de `authenticated` solo cubre `presence`; el SELECT
   (recibir broadcasts confirmados del servidor) no cambia.
6. **Extracción de la infraestructura genérica de canal** a
   `lib/realtime/useRealtimeChannel.ts` (conexión/reconexión/token/
   cleanup ya arreglados en el punto 3) -- `useQuotationPresence` queda
   como wrapper fino. El protocolo `base`/`mutation_id`/conflict se deja
   como **deuda intencional** hasta que Proyectos exista como segundo
   consumidor real: especular su forma con un solo consumidor habría sido
   abstracción prematura.

Cada punto trae su propio test de regresión. Los tres primeros PRs de
prueba en `live` real destaparon 3 fallos que no eran bugs de producto
sino supuestos incorrectos de los tests nuevos (documentado en los
commits de fix, útil si se repiten patrones parecidos en Proyectos):
`channel.send()` con RLS-denegado resuelve `'timed out'`, no `'error'`
(el servidor no manda ningún ack explícito de rechazo); el banner de
conflicto es por-celda y coexisten varios a la vez, así que un locator
de Playwright sin acotar a una fila puede toparse con uno ajeno; y el
dropdown de sugerencias de producto usa `position:fixed` con coordenadas
calculadas solo en `onFocus` -- enfocar antes de scrollear (en vez de
scrollear primero y dejar que `.fill()` sea quien enfoque) lo deja
posicionado donde ya no está el input.

**Resultado:** mergeado a `main` (squash) como
[PR #22](https://github.com/EduardoTerwogt/serenata-erp/pull/22), commit
`6d47adf`. `Test Suite`, `Migrations` y `E2E` (`live` y
`smoke-and-critical`) los tres en verde sobre el propio push a `main`.
**Conclusión de la auditoría: la arquitectura queda READY para Proyectos
sin deuda bloqueante** -- dos huecos de cobertura (responsable concurrente
y foco-en-celda-vs-borrar-fila) quedan como deuda documentada, no
bloqueante, por bajo valor marginal de duplicar un protocolo que ya
prueban otros casos.

