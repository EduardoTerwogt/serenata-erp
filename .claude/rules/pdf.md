---
paths:
  - "lib/server/pdf/**"
---

- `jspdf` + `jspdf-autotable`. Los PDFs se generan en servidor y se suben a Drive.
- **Actualizar reusa `drive_file_id`:** si existe, se actualiza el archivo en Drive
  en vez de crear uno nuevo. No borrar ese campo sin entender el flujo.
- La subida a Drive debe fallar explícitamente si el guardado correspondiente en
  Supabase falla — nada de PDFs huérfanos.
- PDFs existentes: cotización, orden de pago, hoja de llamado, reporte de cierre.
  Todo ajuste de formato requiere tocar código (no hay editor de plantillas: se
  eliminó el 2026-09-23).
- **Cambios de diseño:** se diseñan en Claude Design y el HTML se implementa
  directo en el generador — flujo en `docs/PLAN.md`, motivo en
  `docs/decisions/015-pdfs-disenados-en-claude-design.md`. Cotización ya usa
  dibujo manual con Inter embebida (`fonts/inter.ts`) y sin autotable; reusar
  sus helpers en vez de reinventarlos.
