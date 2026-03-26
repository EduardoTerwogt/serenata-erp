@AGENTS.md

# Serenata ERP — Configuración de sesión

## Setup obligatorio al inicio de cada sesión

Al comenzar cualquier conversación, ejecuta estos pasos ANTES de hacer cualquier cambio:

### 1. Configurar git credentials
```bash
source /home/user/serenata-erp/.env.local.tokens 2>/dev/null || true
git remote set-url origin https://${GITHUB_TOKEN}@github.com/EduardoTerwogt/serenata-erp.git
git config --global user.name "EduardoTerwogt"
git config --global user.email "eduardoterwogt@gmail.com"
git config --global credential.helper store
git checkout main
```

### 2. Verificar que el push funciona
```bash
git push origin main
```
Si falla, leer el token de `.env.local.tokens` y reconfigurar el remote.

---

## Reglas de trabajo

- **Rama:** Siempre trabajar en `main`. NUNCA crear ramas nuevas (no feature branches, no PR).
- **Push:** Hacer commit + push a `main` después de cada cambio. Vercel despliega automáticamente.
- **Deploy:** Vercel detecta cada push a `main` y despliega en 1-2 minutos.

---

## Información del proyecto

- **App en producción:** https://serenata-erp.vercel.app
- **Repositorio GitHub:** https://github.com/EduardoTerwogt/serenata-erp
- **Rama de producción:** `main`
- **Token:** guardado en `/home/user/serenata-erp/.env.local.tokens` (gitignored)

---

## Stack

- Next.js 16 (App Router) + TypeScript + React 19
- Supabase (PostgreSQL) como base de datos
- Tailwind CSS v4 — tema negro/carbón (`zinc`) con acentos naranja `#ff8000`
- Vercel para deploy automático desde `main`

---

## Contexto de negocio

ERP para productora audiovisual/filmográfica. Módulos:
- **Cotizaciones** — crear, aprobar, generar PDF. Folio auto: SH001, SH002...
- **Proyectos** — creados al aprobar cotización. Estados: PREPRODUCCION → RODAJE → POSTPRODUCCION → FINALIZADO
- **Cuentas** — por cobrar (cliente) y por pagar (responsables)
- **Responsables/Colaboradores** — con historial de proyectos y pagos
