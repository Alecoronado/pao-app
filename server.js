require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');
const { STAGES, computeEtapaActual } = require('./db/stages');

const app = express();
app.use(express.json());

const PROJECT_FIELDS = [
  'garantia', 'codigo', 'pais', 'apodo', 'prioridad',
  ...STAGES.map((s) => s.key),
  'estado', 'probabilidad',
  'monto_total', 'aprob_2026', 'aprob_2027', 'aprob_2028', 'aprob_2029',
  'monto_aprobado', 'desem_2026', 'desem_2027', 'desem_2028', 'desem_2029',
  'fecha_reporte', 'fecha_aprobacion', 'notas',
];

function toDateStr(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v.slice(0, 10);
  return v;
}

function withComputed(row) {
  return {
    ...row,
    fecha_reporte: toDateStr(row.fecha_reporte),
    fecha_aprobacion: toDateStr(row.fecha_aprobacion),
    etapa_actual: computeEtapaActual(row),
  };
}

// --- "login" liviano: identifica al usuario por header, sin contraseña ---
async function currentUser(req) {
  const name = req.header('x-user-name');
  if (!name) return null;
  const { rows } = await pool.query('SELECT * FROM users WHERE name = $1', [name]);
  return rows[0] || null;
}

function canEdit(user) {
  return !!user && (user.role === 'admin' || user.role === 'editor');
}

// ---------- USERS ----------
app.get('/api/users', async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, email, role FROM users ORDER BY id');
  res.json(rows);
});

app.post('/api/users', async (req, res) => {
  const user = await currentUser(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Solo un admin puede crear usuarios.' });
  const { name, email, role } = req.body;
  if (!name) return res.status(400).json({ error: 'Falta el nombre.' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, role) VALUES ($1,$2,$3) RETURNING id, name, email, role',
      [name, email || null, role || 'viewer']
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: 'No se pudo crear el usuario (¿nombre repetido?).' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const user = await currentUser(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Solo un admin puede editar usuarios.' });
  const { role, email } = req.body;
  const { rows } = await pool.query(
    'UPDATE users SET role = COALESCE($1, role), email = COALESCE($2, email) WHERE id = $3 RETURNING id, name, email, role',
    [role || null, email || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado.' });
  res.json(rows[0]);
});

// ---------- PROJECTS ----------
app.get('/api/projects', async (req, res) => {
  const { garantia, estado, prioridad, probabilidad, pais, q } = req.query;
  const clauses = [];
  const params = [];
  function add(col, val) {
    params.push(val);
    clauses.push(`${col} = $${params.length}`);
  }
  if (garantia) add('garantia', garantia);
  if (estado) add('estado', estado);
  if (prioridad) add('prioridad', prioridad);
  if (probabilidad) add('probabilidad', probabilidad);
  if (pais) add('pais', pais);
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    clauses.push(`(LOWER(apodo) LIKE $${params.length} OR LOWER(codigo) LIKE $${params.length})`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM projects ${where} ORDER BY pais, apodo`,
    params
  );
  res.json(rows.map(withComputed));
});

app.get('/api/summary', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM projects');
  const total = rows.length;
  const monto_pipeline = rows.reduce((a, r) => a + Number(r.monto_total || 0), 0);
  const monto_aprobado = rows.reduce((a, r) => a + Number(r.monto_aprobado || 0), 0);
  res.json({ total, monto_pipeline, monto_aprobado });
});

app.get('/api/projects/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado.' });
  res.json(withComputed(rows[0]));
});

app.get('/api/projects/:id/history', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM project_history WHERE project_id = $1 ORDER BY changed_at DESC LIMIT 200',
    [req.params.id]
  );
  res.json(rows);
});

app.post('/api/projects', async (req, res) => {
  const user = await currentUser(req);
  if (!canEdit(user)) return res.status(403).json({ error: 'No tenés permiso para crear proyectos.' });

  const cols = [];
  const placeholders = [];
  const params = [];
  PROJECT_FIELDS.forEach((f) => {
    if (req.body[f] !== undefined) {
      params.push(req.body[f] === '' ? null : req.body[f]);
      cols.push(f);
      placeholders.push(`$${params.length}`);
    }
  });
  cols.push('updated_by');
  params.push(user.name);
  placeholders.push(`$${params.length}`);

  const { rows } = await pool.query(
    `INSERT INTO projects (${cols.join(',')}) VALUES (${placeholders.join(',')}) RETURNING *`,
    params
  );
  res.status(201).json(withComputed(rows[0]));
});

app.put('/api/projects/:id', async (req, res) => {
  const user = await currentUser(req);
  if (!canEdit(user)) return res.status(403).json({ error: 'No tenés permiso para editar. Usá "Solicitar cambio".' });

  const { rows: existingRows } = await pool.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'No encontrado.' });

  const sets = [];
  const params = [];
  const historyEntries = [];
  PROJECT_FIELDS.forEach((f) => {
    if (req.body[f] !== undefined) {
      const newVal = req.body[f] === '' ? null : req.body[f];
      const oldVal = existing[f];
      const oldStr = oldVal === null || oldVal === undefined ? '' : String(oldVal);
      const newStr = newVal === null || newVal === undefined ? '' : String(newVal);
      if (oldStr !== newStr) {
        params.push(newVal);
        sets.push(`${f} = $${params.length}`);
        historyEntries.push([f, oldStr, newStr]);
      }
    }
  });

  if (sets.length === 0) return res.json(withComputed(existing));

  params.push(user.name);
  sets.push(`updated_by = $${params.length}`);
  sets.push('updated_at = now()');
  params.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE projects SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );

  for (const [field, oldValue, newValue] of historyEntries) {
    await pool.query(
      'INSERT INTO project_history (project_id, field, old_value, new_value, changed_by) VALUES ($1,$2,$3,$4,$5)',
      [req.params.id, field, oldValue, newValue, user.name]
    );
  }

  res.json(withComputed(rows[0]));
});

app.delete('/api/projects/:id', async (req, res) => {
  const user = await currentUser(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Solo un admin puede borrar proyectos.' });
  await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

app.get('/api/stages', (req, res) => res.json(STAGES));

// ---------- Static frontend ----------
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`PAO app escuchando en puerto ${PORT}`));
}

module.exports = app;
