require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');
const { STAGES, computeEtapaActual } = require('./db/stages');
const { ROLE_SLUGS, ROLE_LABELS, isDeveloper } = require('./db/roles');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('./db/auth');

const app = express();
app.set('trust proxy', true); // Railway está detrás de un proxy; necesario para req.ip real (rate limit de login)
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

// --- Login por rol: usuario/contraseña + token firmado (Authorization: Bearer) ---
async function currentUser(req) {
  const auth = req.header('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const displayName = (req.header('x-display-name') || '').trim().slice(0, 60) || ROLE_LABELS[payload.role] || payload.role;
  return { username: payload.username, role: payload.role, displayName };
}

function canEdit(user) {
  return !!user;
}

function auditName(user) {
  const label = ROLE_LABELS[user.role] || user.role;
  return `${user.displayName} (${label})`;
}

// --- Rate limiting simple para /api/auth/login (en memoria, por ip+usuario) ---
const loginAttempts = new Map();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(key) {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}
function registerFailedAttempt(key) {
  const entry = loginAttempts.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}
function clearAttempts(key) {
  loginAttempts.delete(key);
}

// ---------- AUTH ----------
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Falta usuario o contraseña.' });
  const key = `${req.ip}:${username}`;
  if (isRateLimited(key)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Probá de nuevo en unos minutos.' });
  }
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const account = rows[0];
  const ok = account && await verifyPassword(password, account.password_hash);
  if (!ok) {
    registerFailedAttempt(key);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  clearAttempts(key);
  const token = signToken({ username: account.username, role: account.role });
  res.json({ token, role: account.role, roleLabel: ROLE_LABELS[account.role] || account.role });
});

// ---------- USERS (gestión de cuentas, solo Desarrollador) ----------
app.get('/api/users', async (req, res) => {
  const user = await currentUser(req);
  if (!user || !isDeveloper(user.role)) return res.status(403).json({ error: 'Solo Desarrollador puede ver las cuentas.' });
  const { rows } = await pool.query('SELECT id, username, email, role FROM users ORDER BY id');
  res.json(rows);
});

app.put('/api/users/:id', async (req, res) => {
  const user = await currentUser(req);
  if (!user || !isDeveloper(user.role)) return res.status(403).json({ error: 'Solo Desarrollador puede editar cuentas.' });
  const { email, password, role } = req.body || {};
  if (role && !ROLE_SLUGS.includes(role)) return res.status(400).json({ error: 'Rol inválido.' });

  const sets = [];
  const params = [];
  if (email !== undefined) { params.push(email || null); sets.push(`email = $${params.length}`); }
  if (role) { params.push(role); sets.push(`role = $${params.length}`); }
  if (password) { params.push(await hashPassword(password)); sets.push(`password_hash = $${params.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nada para actualizar.' });

  params.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id, username, email, role`,
    params
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
  params.push(auditName(user));
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

  params.push(auditName(user));
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
      [req.params.id, field, oldValue, newValue, auditName(user)]
    );
  }

  res.json(withComputed(rows[0]));
});

app.delete('/api/projects/:id', async (req, res) => {
  const user = await currentUser(req);
  if (!user || !isDeveloper(user.role)) return res.status(403).json({ error: 'Solo Desarrollador puede borrar proyectos.' });
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
