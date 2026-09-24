# Trabajo activo

**Última actualización:** 2026-09-24 (sesión 7 — cerrada)

## Estado

**`docs/PLAN.md` — Vacío.** No hay iniciativa multi-sesión abierta. Todo lo
de esta sesión está en `main` y aplicado en test y producción.

## Completado en la sesión 7

- **Advisor de Supabase sin WARN** — PR
  [#91](https://github.com/EduardoTerwogt/serenata-erp/pull/91) (`fe5e4fe`):
  `search_path` fijo en 10 funciones vía `ALTER FUNCTION … SET` (sin
  reescribir cuerpos) y `pg_trgm` movida a `extensions`. Test y prod: 0 WARN.
- **Folios CC/CP por año** — PR
  [#92](https://github.com/EduardoTerwogt/serenata-erp/pull/92) (`410fdd8`):
  `siguiente_folio(serie, momento)` sobre `folio_contadores`; año en curso
  (hora CDMX) y consecutivo que reinicia cada año (decisión del usuario).
  2026 continúa (prod: CC 42 → 43, CP 105 → 106). Además: `LPAD` ya no
  trunca ≥ 100000 y anon/authenticated sin EXECUTE. Verificado en test y
  prod con transacciones revertidas (el contador no consume folios en
  rollback; confirmado que prod siguió en 42/105).
- **Configuración de Vercel (vía MCP)** — ver "Pasos manuales" abajo: los
  Previews apuntaban a la base de **producción**; ahora usan test.

## Tests ejecutados

- Local en ambos PRs: `tsc` limpio, lint 0 errores (8 warnings previos),
  `npm test` 963/963.
- CI de #91 y #92: `test`, `fresh-db`, `smoke-and-critical`, `live` y
  Preview de Vercel en verde.

## Pasos manuales M1/M2/V1/V2 — todos cerrados

- **M1:** `NEXTAUTH_SECRET` fuera de Production y Preview (NextAuth lee
  `AUTH_SECRET` primero); sesiones abiertas de staff y Portal sobrevivieron
  al redeploy.
- **M2:** los Previews usaban la base de **producción**. Estado actual de
  Vercel `serenata-erp`: Supabase (URL/anon/service_role/JWT secret) y
  Google (carpetas Drive, refresh token, Sheets, Calendar) tienen entradas
  separadas — Production+Development → prod; Preview → `serenata-erp-test`
  y la carpeta Drive de test de CI, **sin** refresh token (Drive apagado en
  Preview a propósito) ni Sheets/Calendar. `GOOGLE_CLIENT_ID/SECRET`,
  `AUTH_SECRET` y el resto siguen compartidos.
- **V1:** colaboración verificada en Preview con 2 usuarios. Bug leve de
  Presence (el aviso de edición no se quita al salir) en ROADMAP → "Después".
- **V2:** no existe login con Google (`auth.ts` solo `Credentials`); Drive de
  prod funcionando (subidas reales hasta el 21-sep).
- Usuarios de prueba **solo en `serenata-erp-test`**:
  `prueba-manual@serenata.test` y `prueba-manual-2@serenata.test`
  (contraseñas entregadas al usuario en la sesión, no en el repo).

## Pendiente del usuario

- Borrar en Vercel la entrada de `NEXTAUTH_SECRET` que quedó en Development
  (el MCP de Vercel no puede borrar variables; nada la lee).
- Borrar ramas remotas ya mergeadas (GitHub → Branches → Merged).

## Deuda técnica

- Drive apagado en Preview a propósito. Si hace falta: token vía
  `/api/integrations/drive/authorize` con una cuenta de pruebas + carpeta de
  test accesible con scope `drive.file`.
- Las secuencias `seq_cc_2026`/`seq_cp_2026` quedaron sin uso tras #92
  (no se borraron; se pueden eliminar en una limpieza futura).
- El MCP de Vercel no tiene alcance de team para logs de runtime ni para
  abrir URLs de deployment (403); la verificación de Previews se hizo por
  los logs de Supabase.

## Siguiente paso

Nada en curso. Priorizar en Chat (`docs/ROADMAP.md` → "Siguiente"/"Después";
incluye el bug de Presence y la decisión de borrar
`cliente_id_backfill_clasificacion`).
