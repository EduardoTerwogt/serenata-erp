-- Elimina los restos en base de datos de la iniciativa "Editor de PDFs"
-- (PR #81, #83), cancelada el 2026-09-23 — ver
-- docs/decisions/015-pdfs-disenados-en-claude-design.md. Borrado autorizado
-- explícitamente por el usuario. Ningún PDF de producción leyó nunca esta
-- tabla (renderFromTemplate() nunca se conectó a una ruta real) y el código
-- que la usaba ya se eliminó.
--
-- 1. Borra la tabla pdf_plantillas (su policy RLS se va con ella).
-- 2. Quita la sección 'editor-pdfs' de los permisos de usuarios; el código ya
--    no la reconoce (lib/authz.ts la ignora), esto solo limpia el dato.
--
-- Idempotente y reproducible desde una base vacía.

DROP TABLE IF EXISTS pdf_plantillas;

UPDATE usuarios
SET sections = array_remove(sections, 'editor-pdfs')
WHERE 'editor-pdfs' = ANY(sections);
