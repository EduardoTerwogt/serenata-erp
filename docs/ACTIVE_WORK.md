# Trabajo activo

**Última actualización:** 2026-09-12

## Estado

**Ninguna iniciativa activa.**

Fase 8.7.2 (drenado real por celda en Cotizaciones + sincronización de migraciones
de producción) cerró el 2026-09-12. `test`, `fresh-db`, `smoke-and-critical` y
`live` (42/42) confirmados en verde real en CI para el PR
[#28](https://github.com/EduardoTerwogt/serenata-erp/pull/28). Historia completa:
`docs/archive/fase-8.7.2-drenado-partidas-y-sincronizacion.md`. Resumen en
`docs/ROADMAP.md` → Cerrado. Cambios de `ARCHITECTURE.md` → Edición colaborativa.

## Pendiente (no bloquea, sin dueño todavía)

- **Modo de uso de `scripts/check-schema-parity.mjs`:** ¿paso manual obligatorio
  antes de mergear a `main`, o workflow de GitHub Actions separado y protegido (con
  el secreto de producción restringido a ese entorno)? Ninguna de las dos
  automatizaciones está implementada — decisión del usuario, sin urgencia.

## Siguiente paso

Ninguno con dueño asignado. El PR #28 queda listo para que el usuario confirme su
prueba manual en el preview de Vercel (borrar una partida en una cotización
existente) y autorice el merge a `main` cuando quiera.
