process.env.USE_PGLITE = '1';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function main() {
  const pool = require('../db');
  const { USERS, PROJECTS } = require('../db/seed-data');
  const { STAGES } = require('../db/stages');

  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.exec(schema);
  for (const u of USERS) await pool.query('INSERT INTO users (name, email, role) VALUES ($1,$2,$3)', [u.name, u.email || null, u.role]);
  for (const p of PROJECTS) {
    const stageCols = STAGES.map((s) => s.key);
    const cols = ['garantia','codigo','pais','apodo','prioridad',...stageCols,'estado','probabilidad',
      'monto_total','aprob_2026','aprob_2027','aprob_2028','aprob_2029','monto_aprobado',
      'desem_2026','desem_2027','desem_2028','desem_2029','fecha_reporte','updated_by'];
    const vals = [p.garantia,p.codigo,p.pais,p.apodo,p.prioridad,...p.stages,p.estado,p.probabilidad,
      p.monto_total,p.aprob[0],p.aprob[1],p.aprob[2],p.aprob[3],p.monto_aprobado,
      p.desem[0],p.desem[1],p.desem[2],p.desem[3],p.fecha_reporte,'seed'];
    const placeholders = vals.map((_, i) => `$${i+1}`).join(',');
    await pool.query(`INSERT INTO projects (${cols.join(',')}) VALUES (${placeholders})`, vals);
  }

  const app = require('../server');
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  let r = await fetch(`${base}/`);
  assert.strictEqual(r.status, 200);
  let html = await r.text();
  assert.ok(html.includes('PAO'), 'index.html deberia mencionar PAO');
  assert.ok(html.includes('app.js'), 'index.html deberia referenciar app.js');
  console.log('✔ GET / sirve index.html (', html.length, 'bytes )');

  r = await fetch(`${base}/styles.css`);
  assert.strictEqual(r.status, 200);
  assert.ok((await r.text()).includes('--navy'));
  console.log('✔ GET /styles.css OK');

  r = await fetch(`${base}/app.js`);
  assert.strictEqual(r.status, 200);
  const js = await r.text();
  assert.ok(js.includes('function init'));
  console.log('✔ GET /app.js OK (', js.length, 'bytes )');

  r = await fetch(`${base}/api/users`);
  const users = await r.json();
  assert.strictEqual(users.length, 5);
  console.log('✔ GET /api/users ->', users.map(u => `${u.name}(${u.role})`).join(', '));

  r = await fetch(`${base}/api/projects`);
  const projects = await r.json();
  assert.strictEqual(projects.length, 24);
  // Chequeo visual rapido: todos los campos esperados presentes
  const p0 = projects[0];
  ['id','pais','apodo','estado','probabilidad','etapa_actual','monto_total','fecha_aprobacion'].forEach((k) => {
    assert.ok(k in p0, `falta campo ${k} en la respuesta de projects`);
  });
  console.log('✔ GET /api/projects -> 24 proyectos, campos completos');

  // Ruta desconocida cae al index (SPA fallback) sin romper
  r = await fetch(`${base}/cualquier-cosa`);
  assert.strictEqual(r.status, 200);
  console.log('✔ Fallback SPA para rutas desconocidas OK');

  server.close();
  console.log('\nSMOKE TEST OK ✅');
}

main().catch((e) => { console.error('❌ SMOKE TEST FALLO:', e); process.exit(1); });
