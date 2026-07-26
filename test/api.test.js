process.env.USE_PGLITE = '1';
process.env.SESSION_SECRET = 'test-secret';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TEST_PASSWORD = 'test-pass-1234';

async function main() {
  const pool = require('../db');
  const { PROJECTS } = require('../db/seed-data');
  const { ROLES } = require('../db/roles');
  const { STAGES, computeEtapaActual } = require('../db/stages');
  const { hashPassword } = require('../db/auth');

  // 1) migrar schema
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.exec(schema);

  // 2) seed usuarios (una cuenta por rol, misma contraseña de test) y proyectos
  for (const r of ROLES) {
    const password_hash = await hashPassword(TEST_PASSWORD);
    await pool.query('INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3)', [r.slug, password_hash, r.slug]);
  }
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
  console.log('✔ schema + seed OK (%d cuentas de rol, %d proyectos)', ROLES.length, PROJECTS.length);

  // 3) levantar server real sobre esta misma pool/pglite
  const app = require('../server');
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  async function login(username) {
    const r = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: TEST_PASSWORD }),
    });
    assert.strictEqual(r.status, 200, `login de ${username} debería funcionar`);
    return r.json();
  }
  function authHeaders(token, displayName) {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-display-name': displayName };
  }

  // --- Test: login rechaza contraseña incorrecta ---
  let r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'vp', password: 'incorrecta' }),
  });
  assert.strictEqual(r.status, 401, 'contraseña incorrecta debería devolver 401');
  console.log('✔ login rechaza contraseña incorrecta');

  const vpAuth = await login('vp');
  assert.strictEqual(vpAuth.role, 'vp');
  const devAuth = await login('desarrollador');
  assert.strictEqual(devAuth.role, 'desarrollador');
  const asesorAuth = await login('asesor_senior');
  console.log('✔ login OK para vp, desarrollador, asesor_senior');

  // --- Test: sin token no se puede editar ---
  r = await fetch(`${base}/api/projects`);
  let projects = await r.json();
  assert.strictEqual(projects.length, 24, `esperaba 24 proyectos, hubo ${projects.length}`);
  assert.ok(!projects.some(p => p.apodo.includes('Cooperaciones Técnicas')), 'CTs no debería estar');
  console.log('✔ CTs excluido, total =', projects.length);

  const fpiVialidad = projects.find(p => p.apodo === 'FPI - VIALIDAD');
  r = await fetch(`${base}/api/projects/${fpiVialidad.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monto_total: 999 }),
  });
  assert.strictEqual(r.status, 403, 'sin sesión no debería poder editar');
  console.log('✔ sin sesión bloqueado al intentar editar (403)');

  // --- Test: cualquier rol logueado puede editar (incl. asesor_senior) ---
  r = await fetch(`${base}/api/projects/${fpiVialidad.id}`, {
    method: 'PUT',
    headers: authHeaders(asesorAuth.token, 'Juan'),
    body: JSON.stringify({ monto_total: 999, fecha_aprobacion: '2026-08-15' }),
  });
  assert.strictEqual(r.status, 200, 'asesor_senior debería poder editar');
  const updated = await r.json();
  assert.strictEqual(Number(updated.monto_total), 999);
  assert.strictEqual(updated.fecha_aprobacion, '2026-08-15');
  console.log('✔ asesor_senior puede editar monto_total y fecha_aprobacion');

  // --- Test: historial guarda "Nombre (Rol)" ---
  r = await fetch(`${base}/api/projects/${fpiVialidad.id}/history`);
  const hist = await r.json();
  assert.ok(hist.some(h => h.field === 'monto_total' && h.changed_by === 'Juan (Asesor Senior)'), 'debería quedar "Juan (Asesor Senior)" en el historial');
  console.log('✔ historial de auditoría registra nombre + rol');

  // --- Test: solo desarrollador puede borrar ---
  r = await fetch(`${base}/api/projects/${fpiVialidad.id}`, {
    method: 'DELETE',
    headers: authHeaders(vpAuth.token, 'María'),
  });
  assert.strictEqual(r.status, 403, 'vp no debería poder borrar proyectos');
  console.log('✔ vp bloqueado al intentar borrar (403)');

  r = await fetch(`${base}/api/projects/${fpiVialidad.id}`, {
    method: 'DELETE',
    headers: authHeaders(devAuth.token, 'Alessandro'),
  });
  assert.strictEqual(r.status, 204, 'desarrollador debería poder borrar');
  console.log('✔ desarrollador puede borrar proyectos');

  // --- Test: solo desarrollador puede listar/editar cuentas ---
  r = await fetch(`${base}/api/users`, { headers: authHeaders(vpAuth.token, 'María') });
  assert.strictEqual(r.status, 403, 'vp no debería poder ver las cuentas');
  r = await fetch(`${base}/api/users`, { headers: authHeaders(devAuth.token, 'Alessandro') });
  assert.strictEqual(r.status, 200, 'desarrollador debería poder ver las cuentas');
  const users = await r.json();
  assert.strictEqual(users.length, 5);
  assert.ok(!('password_hash' in users[0]), 'no debería exponer password_hash');
  console.log('✔ gestión de cuentas restringida a desarrollador (5 cuentas, sin password_hash)');

  // --- Test: etapa actual (punto 4 del pedido original) ---
  const ruta13 = projects.find(p => p.apodo.includes('RUTA 13'));
  assert.strictEqual(ruta13.etapa_actual, 'Aprobación', `Ruta 13 (todo tildado) -> Aprobación, dio ${ruta13.etapa_actual}`);
  const sergipe = projects.find(p => p.apodo === 'SERGIPE');
  assert.strictEqual(sergipe.etapa_actual, 'NEG.', `Sergipe (falta NEG) -> NEG., dio ${sergipe.etapa_actual}`);
  const badesc = projects.find(p => p.apodo === 'BADESC');
  assert.strictEqual(badesc.etapa_actual, 'Aprobado', `BADESC (estado APROBADO) -> Aprobado, dio ${badesc.etapa_actual}`);
  console.log('✔ lógica de "etapa actual" correcta');

  // --- Test: summary ---
  r = await fetch(`${base}/api/summary`);
  const summary = await r.json();
  assert.strictEqual(summary.total, 23); // se borró FPI - VIALIDAD arriba
  console.log('✔ /api/summary total =', summary.total);

  server.close();
  console.log('\nTODOS LOS TESTS PASARON ✅');
}

main().catch((e) => {
  console.error('❌ TEST FALLÓ:', e);
  process.exit(1);
});
