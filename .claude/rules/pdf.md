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
  Todo ajuste de formato requiere tocar código hoy.
