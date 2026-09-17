# Git — setup, rama y PR

Detalle completo de las reglas de git resumidas en `CLAUDE.md`. Carga siempre,
igual que `CLAUDE.md` (no tiene `paths:`, no está scopeado a un tipo de archivo).

## Setup de sesión

```bash
git config --global user.name "EduardoTerwogt"
git config --global user.email "eduardoterwogth@gmail.com"
source /home/user/serenata-erp/.env.local.tokens 2>/dev/null
git remote set-url origin https://${GITHUB_TOKEN}@github.com/EduardoTerwogt/serenata-erp.git

# main local siempre = main real de GitHub, nunca al revés (todo pasa por rama+PR
# o por el push doc-only directo, que no toca la rama local `main`).
git fetch origin main
git branch -f main origin/main
```

**El correo lleva "h" al final.** `eduardoterwogt@gmail.com` (sin "h") no corresponde
a ninguna cuenta de GitHub y Vercel rechaza el deploy con "could not be matched to a
GitHub account". Ya pasó una vez; no volver a quitarla.

`.env.local.tokens` está en `.gitignore` y no viaja en el repo: en un entorno nuevo
hay que crearlo con el `GITHUB_TOKEN` que dé el usuario.

## Rama + PR, merge al final

**Se trabaja en rama dedicada, nunca directo sobre `main`.** El merge a `main` ocurre
solo cuando el trabajo está terminado y todas las suites pasaron. `main` siempre debe
ser una versión desplegable.

**Excepción — solo documentación:** si el diff completo toca **únicamente archivos
`.md`** — cualquiera del repo, sin excepción: `CLAUDE.md`, `README.md`,
`ARCHITECTURE.md`, `TESTING.md`, `DESIGN_SYSTEM.md`, lo que sea bajo `docs/`,
`.claude/skills/*/SKILL.md`, `.claude/rules/*.md`, etc. — cero código de la app,
migraciones, config o scripts — se commitea y pushea **directo a `main`**, sin rama
ni PR. Un `.md` no lo ejecuta el build ni los tests, así que no hay CI real que
perderse. Si el diff toca aunque sea un archivo que no sea `.md`, deja de aplicar la
excepción y todo el cambio (incluida la parte de documentación) sigue el flujo
normal de rama + PR.

**Esta excepción aplica igual en sesiones de Claude Code remotas/en la nube**
(las que corren en un branch asignado por el entorno, no en la máquina local del
usuario). El usuario autorizó explícitamente el push directo a `main` para diffs
100% `.md` también en ese tipo de sesión — no hace falta confirmar de nuevo ni
quedarse en la rama asignada solo por precaución cuando el diff es 100%
documentación.

```bash
git fetch origin main
git branch -f main origin/main       # por si el setup de sesión no corrió antes
git switch -c <rama-de-trabajo> origin/main   # o git switch <rama> si ya existe
```

**Un push a la rama sin PR abierto no corre CI** (`test.yml`/`e2e.yml`/
`migrations.yml` solo se disparan por PR o por push a `main`). Abrir el PR hacia
`main` **en borrador** en cuanto exista el primer commit útil — no esperar a
terminar el trabajo.

- **Nunca `git reset --hard` automático.** Si el árbol está sucio, `git status`
  primero y preguntar.
- Commit + push a la rama después de cada cambio funcional terminado — es seguro,
  no despliega ni mergea nada.
- **Antes del merge:** todas las suites verdes en el PR y el Preview de Vercel
  desplegando bien. Que el push tuviera éxito no prueba nada, y sin PR esas suites
  nunca corrieron.
- `origin/main` es la verdad para el punto de partida de una rama, no para
  sobrescribirla mientras se trabaja en ella.
- **Ejecución entre sesiones:** una sesión nueva nunca ejecuta ni pushea tareas en
  cola de otra sesión al abrir — confirmar primero. `pre-push-gate.mjs` fuerza esa
  pausa solo en el primer push **a `main`** de cada sesión; los pushes a ramas
  pasan sin fricción.
