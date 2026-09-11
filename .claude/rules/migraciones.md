---
paths:
  - "db/migrations/**"
---

- Las migraciones aplicadas son **append-only**. Nunca modificar una que ya corrió
  en producción — agregar una nueva encima.
- Todo cambio aplicado a producción se guarda aquí como archivo numerado y se commitea.
- `SECURITY DEFINER` debe fijar `search_path`. Revisar permisos `EXECUTE`.
- El upsert de partidas va siempre acotado por `cotizacion_id`, nunca genérico.
- El job `Migrations` de CI reconstruye el schema desde un Postgres vacío en cada
  push: si una migración no es reproducible desde cero, ahí falla.
- Probar primero en `serenata-erp-test` (ref `ozrtsludmcguvgqdjicn`), luego producción.
- Contexto completo: `docs/decisions/005-migraciones-manuales-append-only.md`.
