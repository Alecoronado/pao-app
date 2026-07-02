process.env.USE_PGLITE = '1';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function main() {
  const pool = require('../db');
  const { USERS, PROJECTS } = require('../db/seed-data');
  const { STAGES, computeEtapaActual } = require('../db/stages');

  // 1) migrar schema
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.exec(schema);

  // 2) seed usuarios y proyectos (reutilizando misma lógica que seed.js)
  for (const u of USERS) {
    await pool.query('INSERT INTO users (name, email, role) VALUES ($1,$2,$3)', [u.name, u.email || null, u.role]);
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
  console.log('✔ schema + seed OK (%d usuarios, %d proyectos)', USERS.length, PROJECTS.length);

  // 3) levantar server real sobre esta misma pool/pglite
  const app = require('../server');
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  // --- Test: CTs no debe existir ---
  let r = await fetch(`${base}/api/projects`);
  let projects = await r.json();
  assert.strictEqual(projects.length, 24, `esperaba 24 proyectos, hubo ${projects.length}`);
  assert.ok(!projects.some(p => p.apodo.includes('Cooperaciones Técnicas')), 'CTs no debería estar');
  console.log('✔ CTs excluido, total =', projects.length);

  // --- Test: etapa actual (punto 4 del pedido) ---
  const ruta13 = projects.find(p => p.apodo.includes('RUTA 13'));
  assert.strictEqual(ruta13.etapa_actual, 'Aprobación', `Ruta 13 (todo tildado) -> Aprobación, dio ${ruta13.etapa_actual}`);

  const caminosRurales = projects.find(p => p.apodo.includes('CAMINOS RURALES'));
  assert.strictEqual(caminosRurales.etapa_actual, 'PP-PR', `Caminos Rurales (solo ABS) -> PP-PR, dio ${caminosRurales.etapa_actual}`);

  const sergipe = projects.find(p => p.apodo === 'SERGIPE');
  assert.strictEqual(sergipe.etapa_actual, 'NEG.', `Sergipe (falta NEG) -> NEG., dio ${sergipe.etapa_actual}`);

  const badesc = projects.find(p => p.apodo === 'BADESC');
  assert.strictEqual(badesc.etapa_actual, 'Aprobado', `BADESC (estado APROBADO) -> Aprobado, dio ${badesc.etapa_actual}`);

  const caja = projects.find(p => p.apodo === 'CAJA BANCARIA');
  assert.strictEqual(caja.etapa_actual, 'N/C', `Caja Bancaria (todo N/C) -> N/C, dio ${caja.etapa_actual}`);

  const fpiVialidad = projects.find(p => p.apodo === 'FPI - VIALIDAD');
  assert.strictEqual(fpiVialidad.etapa_actual, 'ABS', `FPI Vialidad (nada empezado) -> ABS, dio ${fpiVialidad.etapa_actual}`);
  console.log('✔ lógica de "etapa actual" correcta en todos los casos de prueba');

  // --- Test: permisos (viewer no puede editar, editor sí) ---
  r = await fetch(`${base}/api/projects/${fpiVialidad.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-user-name': 'Gastón' },
    body: JSON.stringify({ monto_total: 999 }),
  });
  assert.strictEqual(r.status, 403, 'Gastón (viewer) no debería poder editar');
  console.log('✔ viewer bloqueado al intentar editar (403)');

  r = await fetch(`${base}/api/projects/${fpiVialidad.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-user-name': 'VP' },
    body: JSON.stringify({ monto_total: 999, fecha_aprobacion: '2026-08-15' }),
  });
  assert.strictEqual(r.status, 200, 'VP (editor) debería poder editar');
  const updated = await r.json();
  assert.strictEqual(Number(updated.monto_total), 999);
  assert.strictEqual(updated.fecha_aprobacion, '2026-08-15');
  console.log('✔ editor puede actualizar monto_total y fecha_aprobacion');

  // --- Test: historial de cambios quedó registrado ---
  r = await fetch(`${base}/api/projects/${fpiVialidad.id}/history`);
  const hist = await r.json();
  assert.ok(hist.some(h => h.field === 'monto_total' && h.changed_by === 'VP'), 'debería haber quedado en el historial');
  console.log('✔ historial de auditoría registrado correctamente');

  // --- Test: summary ---
  r = await fetch(`${base}/api/summary`);
  const summary = await r.json();
  assert.strictEqual(summary.total, 24);
  console.log('✔ /api/summary total =', summary.total, 'pipeline =', summary.monto_pipeline.toFixed(1), 'aprobado =', summary.monto_aprobado.toFixed(1));

  server.close();
  console.log('\nTODOS LOS TESTS PASARON ✅');
}

main().catch((e) => {
  console.error('❌ TEST FALLÓ:', e);
  process.exit(1);
});
