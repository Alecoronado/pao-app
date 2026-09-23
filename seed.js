require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('./db');
const { STAGES } = require('./db/stages');
const { PROJECTS } = require('./db/seed-data');
const { ROLES } = require('./db/roles');
const { hashPassword } = require('./db/auth');

function randomPassword() {
  return crypto.randomBytes(9).toString('base64url'); // ~12 chars, legible
}

async function seedUsers() {
  // 1) Borrar cuentas de roles que ya no existen (ej: jefe_cartera, asesor_senior).
  const { rows: obsolete } = await pool.query(
    'DELETE FROM users WHERE NOT (role = ANY($1::text[])) RETURNING username',
    [ROLES.map((r) => r.slug)]
  );
  if (obsolete.length) {
    console.log('Cuentas eliminadas (roles que ya no existen): ' + obsolete.map((u) => u.username).join(', '));
  }

  // 2) Crear las cuentas que falten. Con RESET_PASSWORDS=1 tambien se renueva la
  //    contraseña de las que ya existen. En ambos casos se usa INIT_PASSWORD_<ROL>
  //    si esta definida, y si no una aleatoria.
  const reset = process.env.RESET_PASSWORDS === '1';
  const generated = [];
  for (const r of ROLES) {
    const { rows } = await pool.query('SELECT id FROM users WHERE username = $1', [r.slug]);
    const exists = rows.length > 0;
    if (exists && !reset) continue; // ya existe, no se pisa la contraseña
    const password = process.env[`INIT_PASSWORD_${r.slug.toUpperCase()}`] || randomPassword();
    const password_hash = await hashPassword(password);
    if (exists) {
      await pool.query('UPDATE users SET password_hash = $1, role = $2 WHERE id = $3', [password_hash, r.slug, rows[0].id]);
    } else {
      await pool.query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3)',
        [r.slug, password_hash, r.slug]
      );
    }
    generated.push({ username: r.slug, label: r.label, password, action: exists ? 'renovada' : 'creada' });
  }
  if (generated.length) {
    console.log('\nCuentas creadas/renovadas (guardá estas contraseñas, no se vuelven a mostrar):');
    generated.forEach((g) => console.log(`  ${g.label.padEnd(26)} usuario: ${g.username.padEnd(26)} contraseña: ${g.password}  (${g.action})`));
    console.log('');
  } else {
    console.log(`Las ${ROLES.length} cuentas de rol ya existían, no se generaron contraseñas nuevas (usá RESET_PASSWORDS=1 para renovarlas).`);
  }
}

async function run() {
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.exec(schema);

  await seedUsers();

  const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS c FROM projects');
  if (countRows[0].c > 0 && process.env.FORCE_RESEED !== '1') {
    console.log('La tabla projects ya tiene datos. Usá FORCE_RESEED=1 para forzar recarga.');
    return;
  }

  if (process.env.FORCE_RESEED === '1') {
    await pool.query('DELETE FROM project_history');
    await pool.query('DELETE FROM projects');
  }

  for (const p of PROJECTS) {
    const stageCols = STAGES.map((s) => s.key);
    const stageVals = p.stages;
    const cols = [
      'garantia', 'codigo', 'pais', 'apodo', 'prioridad',
      ...stageCols,
      'estado', 'probabilidad',
      'monto_total', 'aprob_2026', 'aprob_2027', 'aprob_2028', 'aprob_2029',
      'monto_aprobado', 'desem_2026', 'desem_2027', 'desem_2028', 'desem_2029',
      'fecha_reporte', 'updated_by',
    ];
    const vals = [
      p.garantia, p.codigo, p.pais, p.apodo, p.prioridad,
      ...stageVals,
      p.estado, p.probabilidad,
      p.monto_total, p.aprob[0], p.aprob[1], p.aprob[2], p.aprob[3],
      p.monto_aprobado, p.desem[0], p.desem[1], p.desem[2], p.desem[3],
      p.fecha_reporte, 'seed',
    ];
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
    await pool.query(`INSERT INTO projects (${cols.join(',')}) VALUES (${placeholders})`, vals);
  }

  console.log(`Seed completo: ${PROJECTS.length} proyectos.`);
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
