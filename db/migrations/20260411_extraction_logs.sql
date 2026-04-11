-- Track API usage for Claude extraction
CREATE TABLE extraction_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id text NOT NULL,
  usuario_id text,
  metodo text NOT NULL CHECK (metodo IN ('ai', 'regex')),
  tokens_input integer,
  tokens_output integer,
  costo_usd numeric(10, 6),
  eventos_extraidos integer,
  raw_input text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX idx_extraction_logs_proyecto_fecha
  ON extraction_logs(proyecto_id, created_at DESC);

CREATE INDEX idx_extraction_logs_usuario
  ON extraction_logs(usuario_id, created_at DESC);
