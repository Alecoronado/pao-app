-- PAO - Seguimiento de Proyectos
-- Esquema PostgreSQL

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  email         TEXT,
  role          TEXT NOT NULL DEFAULT 'viewer', -- 'admin' | 'editor' | 'viewer'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id                SERIAL PRIMARY KEY,
  garantia          TEXT NOT NULL DEFAULT 'Soberano',      -- Soberano | No Soberano | Cooperacion
  codigo            TEXT,
  pais              TEXT NOT NULL,
  apodo             TEXT NOT NULL,
  prioridad         INTEGER DEFAULT 1,

  -- Etapas del proceso: 'X' = completada, 'N/C' = no corresponde, NULL = pendiente
  stage_abs         TEXT,
  stage_pp_pr       TEXT,
  stage_pp_cop      TEXT,
  stage_po_pr       TEXT,
  stage_vec         TEXT,
  stage_po_cop      TEXT,
  stage_neg         TEXT,
  stage_dej         TEXT,

  estado            TEXT NOT NULL DEFAULT 'SIN CARTA CONSULTA',
  -- SIN CARTA CONSULTA | CON CARTA CONSULTA | SEGUNDA ETAPA | APROBADO | Prevision

  probabilidad      TEXT NOT NULL DEFAULT 'A',  -- A | B | C

  monto_total       NUMERIC(14,3) DEFAULT 0,   -- Monto Pipeline (M USD)
  aprob_2026        NUMERIC(14,3) DEFAULT 0,
  aprob_2027        NUMERIC(14,3) DEFAULT 0,
  aprob_2028        NUMERIC(14,3) DEFAULT 0,
  aprob_2029        NUMERIC(14,3) DEFAULT 0,
  monto_aprobado    NUMERIC(14,3) DEFAULT 0,
  desem_2026        NUMERIC(14,3) DEFAULT 0,
  desem_2027        NUMERIC(14,3) DEFAULT 0,
  desem_2028        NUMERIC(14,3) DEFAULT 0,
  desem_2029        NUMERIC(14,3) DEFAULT 0,

  fecha_reporte     DATE,
  fecha_aprobacion  DATE,     -- nuevo campo pedido por el usuario

  notas             TEXT,

  updated_by        TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historial de cambios (auditoría simple para el CRM)
CREATE TABLE IF NOT EXISTS project_history (
  id            SERIAL PRIMARY KEY,
  project_id    INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  field         TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  changed_by    TEXT,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_pais ON projects(pais);
CREATE INDEX IF NOT EXISTS idx_projects_estado ON projects(estado);
CREATE INDEX IF NOT EXISTS idx_history_project ON project_history(project_id);
