---
paths:
  - "db/migrations/**"
---

- Las migraciones aplicadas son **append-only**. Nunca modificar una que ya corrió
  en producción — agregar una nueva encima.
  - **Excepción estrecha:** si algo se aplicó manualmente en producción y el
    archivo se quedó corto, se puede editar la migración vieja **solo** para que
    el texto quede igual a lo que la base ya tiene — nunca para cambiar
    comportamiento. Requiere: (1) el statement agregado es idempotente y seguro
    de re-ejecutar desde un Postgres vacío (el job `Migrations` lo va a correr
    igual en cada push), y (2) no afecta ni pone en riesgo otro feature
    existente. Si hay cualquier duda de que esto se cumple, agregar una
    migración nueva en vez de editar la vieja.
- Todo cambio aplicado a producción se guarda aquí como archivo numerado y se commitea.
- `SECURITY DEFINER` debe fijar `search_path`. Revisar permisos `EXECUTE`.
- El upsert de partidas va siempre acotado por `cotizacion_id`, nunca genérico.
- El job `Migrations` de CI reconstruye el schema desde un Postgres vacío en cada
  push: si una migración no es reproducible desde cero, ahí falla.
- Probar primero en `serenata-erp-test` (ref `ozrtsludmcguvgqdjicn`), luego producción.
- Contexto completo: `docs/decisions/005-migraciones-manuales-append-only.md`.
