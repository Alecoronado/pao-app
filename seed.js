require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');
const { STAGES } = require('./db/stages');
const { USERS, PROJECTS } = require('./db/seed-data');

async function run() {
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.exec(schema);

  const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS c FROM projects');
  if (countRows[0].c > 0 && process.env.FORCE_RESEED !== '1') {
    console.log('La tabla projects ya tiene datos. Usá FORCE_RESEED=1 para forzar recarga.');
    return;
  }

  if (process.env.FORCE_RESEED === '1') {
    await pool.query('DELETE FROM project_history');
    await pool.query('DELETE FROM projects');
  }

  for (const u of USERS) {
    await pool.query(
      `INSERT INTO users (name, email, role) VALUES ($1,$2,$3)
       ON CONFLICT (name) DO NOTHING`,
      [u.name, u.email || null, u.role]
    );
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

  console.log(`Seed completo: ${USERS.length} usuarios, ${PROJECTS.length} proyectos.`);
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
