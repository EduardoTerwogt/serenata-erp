# 009 — Revocación de sesión de staff vía `session_version`

## Contexto

Antes de EF-2, un usuario de staff desactivado, con secciones cambiadas o con
password reseteado seguía teniendo un JWT de NextAuth válido hasta que
expirara por tiempo — no había forma de invalidar una sesión en curso desde
`admin_update_usuario`. El Portal de proveedores ya resolvía el mismo
problema para sus propias sesiones
(`db/migrations/20260909_portal_session_version.sql`, `lib/portal-auth.ts`),
pero nunca se replicó para staff/NextAuth.

## Decisión

Mismo patrón que el Portal, aplicado a `usuarios`:

- `usuarios.session_version integer NOT NULL DEFAULT 0` (migración
  `20260913_usuarios_session_version.sql`).
- `admin_update_usuario(uuid, jsonb)` (RPC `SECURITY DEFINER`, `service_role`
  únicamente) incrementa `session_version` solo si el valor resuelto de
  `active`, `sections`, `password_hash` o `email` difiere del actual —
  cambiar `name` a solas nunca invalida. Retorna únicamente `id, email, name,
  sections, active, created_at` (nunca `password_hash`).
- El JWT lleva `session_version` como claim, fijado en el login
  (`lib/auth-callbacks.ts`) y nunca reescrito en llamadas posteriores.
- **Dos puntos de verificación, no uno:**
  - `lib/proxy-handler.ts` (Edge, corre en cada navegación): chequeo
    **optimista**, sin tocar Postgres — si el claim `sessionVersion` no está
    presente o no es un entero ≥ 0 (`Number.isInteger(x) && x >= 0`, no
    `typeof x === 'number'`, que deja pasar `NaN`/`Infinity`/fraccionarios),
    se trata como no autenticado y fuerza un login limpio que sí lo emite.
  - `requireAuthenticated()` (`lib/api-auth.ts`, una vez por request de API):
    consulta `getUsuarioSessionState(id)` contra Postgres y compara
    `session_version`. Aquí sí se detecta la revocación real.
- **Sin adopción en caliente.** Si `sections` cambia, `session_version` sube
  → la sesión vieja queda invalidada con 401 → el cliente hace `signOut()` +
  redirect a `/login`. Nunca se adoptan las secciones nuevas sin relogin.
- **Error transitorio de Postgres ≠ revocación.** Si la consulta a
  `getUsuarioSessionState` lanza (timeout, red, Supabase caído),
  `requireAuthenticated()` responde `503` y dispara logging — la sesión
  queda intacta. Tratar cualquier error de esa consulta como "sesión
  inválida" habría provocado un logout masivo de todo el staff durante una
  caída pasajera de la base.

## Razón

- El JWT va firmado (`AUTH_SECRET`); un atacante no puede forjar un
  `sessionVersion` válido sin el secreto, así que el chequeo optimista en
  el Edge es seguro sin consultar la base — el costo real (un round-trip a
  Postgres) solo se paga donde ya se paga por otras razones (una request de
  API autenticada), no en cada navegación de página.
- Separar "falta el claim" (JWT viejo, pre-despliegue) de "la fila real dice
  que ya no es válida" (revocación) de "no pude ni preguntarle a Postgres"
  (falla transitoria) evita el error más costoso de este tipo de mecanismo:
  confundir una caída de infraestructura con una revocación real y tirar a
  todo el staff de su sesión a la vez.

## Alternativas descartadas

- **Consultar Postgres en cada navegación de página (proxy/Edge).** Correcto
  pero caro — un round-trip extra por cada click de navegación, no solo por
  cada llamada de API. Se descartó porque el JWT firmado ya da la garantía
  de integridad necesaria para diferir esa consulta a las API routes.
- **Adoptar `sections` nuevas sin relogin** (hot-reload del claim). Más
  cómodo para el usuario, pero un cambio de permisos silencioso a mitad de
  sesión es exactamente el tipo de comportamiento que un admin esperaría
  poder auditar/forzar — se prefirió el relogin explícito.

## Consecuencias

- Cualquier cambio futuro a `active`/`sections`/`password_hash`/`email` de
  un usuario **siempre** pasa por `admin_update_usuario`, nunca por un
  `UPDATE` directo a la tabla ni por el `updateUsuario()` legado (que sigue
  existiendo solo para el rehash transparente de password en login, y
  deliberadamente **no** bumpea `session_version`).
- Un JWT emitido antes de este despliegue no trae el claim y fuerza un login
  único — no recurrente — la primera vez que ese usuario navegue después del
  deploy.
- El patrón (JWT claim + chequeo optimista en Edge + verificación real en la
  frontera de API) es el que replicar si aparece un tercer lugar que
  necesite revocación de sesión — no inventar una variante nueva.
