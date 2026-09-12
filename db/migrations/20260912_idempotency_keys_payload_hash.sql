-- Engineering Hardening EF-1, 1E-1 -- withIdempotency() trataba CUALQUIER
-- error de INSERT como "ya existe, es un duplicado" (hallazgo C4). Con esta
-- columna, una segunda request con la misma (scope, key) pero un payload
-- DISTINTO puede detectarse como conflicto real en vez de esperar
-- ciegamente el resultado de una operación ajena y devolverlo como propio.
--
-- Nullable a propósito: filas de callers no migrados a mandar payloadHash
-- durante la ventana transitoria quedan NULL, sin romper nada existente.
-- Una fila completada (status_code IS NOT NULL) siempre reproduce su
-- resultado guardado sin comparar hash -- la respuesta ya es la fuente de
-- verdad. Una fila pendiente con payload_hash NULL (legacy) tampoco compara
-- -- se comporta como hasta ahora.

ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS payload_hash text NULL;
