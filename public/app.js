/* PAO - Seguimiento de Proyectos - frontend */

const STAGES = [
  { key: 'stage_abs',    label: 'ABS' },
  { key: 'stage_pp_pr',  label: 'PP-PR' },
  { key: 'stage_pp_cop', label: 'PP-COP' },
  { key: 'stage_po_pr',  label: 'PO-PR' },
  { key: 'stage_vec',    label: 'VEC' },
  { key: 'stage_po_cop', label: 'PO-COP' },
  { key: 'stage_neg',    label: 'NEG.' },
  { key: 'stage_dej',    label: 'DEJ' },
];

const PAIS_FLAGS = {
  'ARGENTINA': '🇦🇷',
  'BOLIVIA': '🇧🇴',
  'BRASIL': '🇧🇷',
  'PARAGUAY': '🇵🇾',
  'URUGUAY': '🇺🇾',
  'GNS': '◆',
};

const ESTADO_OPTIONS = ['SIN CARTA CONSULTA', 'CON CARTA CONSULTA', 'SEGUNDA ETAPA', 'APROBADO'];
const GARANTIA_OPTIONS = ['Soberano', 'No Soberano'];
const PROB_OPTIONS = ['A', 'B', 'C'];

const state = {
  projects: [],
  users: [],
  currentUserName: localStorage.getItem('pao_user_name') || '',
  filters: { search: '', garantia: '', estado: '', prioridad: '', probabilidad: '', pais: '' },
  editingProject: null, // objeto en edicion (o {} para nuevo)
};

// ---------------- API helpers ----------------
async function api(path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (state.currentUserName) headers['x-user-name'] = state.currentUserName;
  const res = await fetch(path, Object.assign({}, opts, { headers }));
  let data = null;
  try { data = await res.json(); } catch (e) { /* sin body */ }
  if (!res.ok) {
    const msg = (data && data.error) || `Error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function currentUserObj() {
  return state.users.find((u) => u.name === state.currentUserName) || null;
}
function currentRole() {
  const u = currentUserObj();
  return u ? u.role : 'viewer';
}
function canEdit() {
  const r = currentRole();
  return r === 'admin' || r === 'editor';
}
function isAdmin() {
  return currentRole() === 'admin';
}

// ---------------- Toast ----------------
function showToast(msg) {
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

// ---------------- Formatting ----------------
function fmtMonto(n) {
  const v = Number(n || 0);
  return v.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M';
}
function fmtFecha(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ---------------- Load data ----------------
async function loadUsers() {
  state.users = await api('/api/users');
  if (!state.currentUserName && state.users.length) {
    state.currentUserName = state.users[0].name;
  }
  renderUserSelect();
}

async function loadProjects() {
  const params = new URLSearchParams();
  if (state.filters.search) params.set('q', state.filters.search);
  if (state.filters.garantia) params.set('garantia', state.filters.garantia);
  if (state.filters.estado) params.set('estado', state.filters.estado);
  if (state.filters.prioridad) params.set('prioridad', state.filters.prioridad);
  if (state.filters.probabilidad) params.set('probabilidad', state.filters.probabilidad);
  if (state.filters.pais) params.set('pais', state.filters.pais);
  state.projects = await api('/api/projects?' + params.toString());
  renderAll();
}

async function loadSummary() {
  const s = await api('/api/summary');
  document.getElementById('kpiTotal').textContent = s.total;
  document.getElementById('kpiPipeline').textContent = fmtMonto(s.monto_pipeline);
  document.getElementById('kpiAprobado').textContent = fmtMonto(s.monto_aprobado);
}

// ---------------- Rendering: header / user ----------------
function renderUserSelect() {
  const sel = document.getElementById('userSelect');
  sel.innerHTML = state.users.map((u) => `<option value="${u.name}">${u.name}</option>`).join('');
  sel.value = state.currentUserName;
  const role = currentRole();
  const badge = document.getElementById('roleBadge');
  const labelMap = { admin: 'Admin', editor: 'Editor', viewer: 'Consulta' };
  badge.textContent = labelMap[role] || role;
  document.getElementById('newProjectBtn').style.display = canEdit() ? 'inline-flex' : 'none';
  document.getElementById('usersBtn').style.display = isAdmin() ? 'inline-flex' : 'none';
}

// ---------------- Rendering: filters ----------------
function renderFilterOptions() {
  const fill = (id, opts) => {
    const el = document.getElementById(id);
    const current = el.value;
    el.innerHTML = '<option value="">Todas</option>' + opts.map((o) => `<option value="${o}">${o}</option>`).join('');
    el.value = current;
  };
  fill('fGarantia', GARANTIA_OPTIONS);
  fill('fEstado', ESTADO_OPTIONS);
  fill('fProbabilidad', PROB_OPTIONS);

  const prioridades = Array.from(new Set(state.projects.map((p) => p.prioridad).filter((v) => v !== null && v !== undefined))).sort();
  fill('fPrioridad', prioridades);

  const paisWrap = document.getElementById('fPaisFlags');
  const paises = Object.keys(PAIS_FLAGS);
  paisWrap.innerHTML = paises.map((p) => `
    <button type="button" class="flag-btn ${state.filters.pais === p ? 'active' : ''}" data-pais="${p}" title="${p}">${PAIS_FLAGS[p]}</button>
  `).join('');
  paisWrap.querySelectorAll('.flag-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.pais;
      state.filters.pais = state.filters.pais === p ? '' : p;
      renderFilterOptions();
      loadProjects();
    });
  });
}

// ---------------- Rendering: table + cards ----------------
function estadoTagStyle(estado) {
  const map = {
    'SIN CARTA CONSULTA': ['var(--estado-sin-carta)', 'var(--estado-sin-carta-text)'],
    'CON CARTA CONSULTA': ['var(--estado-con-carta)', 'var(--estado-con-carta-text)'],
    'SEGUNDA ETAPA': ['var(--estado-segunda)', 'var(--estado-segunda-text)'],
    'APROBADO': ['var(--estado-aprobado)', 'var(--estado-aprobado-text)'],
  };
  const [bg, color] = map[estado] || ['#EEE', '#555'];
  return `background:${bg};color:${color}`;
}
function probColor(p) {
  return { A: 'var(--prob-a)', B: 'var(--prob-b)', C: 'var(--prob-c)' }[p] || '#999';
}
function stageMarkHtml(project, stage, editable) {
  const val = project[stage.key];
  let cls = 'pending', label = '';
  if (val === 'X') { cls = 'done'; label = '✓'; }
  else if (val === 'N/C') { cls = 'nc'; label = 'N/C'; }
  const editCls = editable ? 'editable' : '';
  return `<span class="stage-mark ${cls} ${editCls}" data-project-id="${project.id}" data-stage="${stage.key}" title="${stage.label}">${label}</span>`;
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  const editable = canEdit();
  if (state.projects.length === 0) {
    tbody.innerHTML = '';
    document.getElementById('emptyState').style.display = 'block';
  } else {
    document.getElementById('emptyState').style.display = 'none';
  }

  tbody.innerHTML = state.projects.map((p) => {
    const stageCells = STAGES.map((s) => `<td class="stage-cell">${stageMarkHtml(p, s, editable)}</td>`).join('');
    const fecha = p.fecha_aprobacion;
    const fechaBtn = `<button class="fecha-aprob-btn ${fecha ? 'set' : ''}" data-id="${p.id}" data-action="fecha">
      ${fecha ? fmtFecha(fecha) : (editable ? 'Fijar fecha' : '-')}
    </button>`;
    return `
      <tr>
        <td class="col-left"><div class="pais-cell"><span>${PAIS_FLAGS[p.pais] || '•'}</span> ${p.pais}</div></td>
        <td><span class="codigo-chip">${p.codigo || '-'}</span></td>
        <td class="col-left apodo-cell">${p.apodo}</td>
        <td><span class="estado-tag" style="${estadoTagStyle(p.estado)}">${p.estado}</span></td>
        <td><span class="prob-dot" style="background:${probColor(p.probabilidad)}">${p.probabilidad}</span></td>
        <td>${p.garantia}</td>
        ${stageCells}
        <td><span class="etapa-actual-chip">${p.etapa_actual}</span></td>
        <td class="monto-cell">${fmtMonto(p.monto_total)}</td>
        <td class="monto-cell monto-aprob">${p.monto_aprobado ? fmtMonto(p.monto_aprobado) : '-'}</td>
        <td>${fechaBtn}</td>
        <td>
          <div class="row-actions">
            ${editable ? `<button class="icon-btn" data-action="edit" data-id="${p.id}" title="Editar">✏️</button>` : ''}
            ${isAdmin() ? `<button class="icon-btn" data-action="delete" data-id="${p.id}" title="Eliminar">🗑️</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('footTotal').textContent = `TOTAL — ${state.projects.length} proyectos`;
  const pipeline = state.projects.reduce((a, p) => a + Number(p.monto_total || 0), 0);
  const aprobado = state.projects.reduce((a, p) => a + Number(p.monto_aprobado || 0), 0);
  document.getElementById('footPipeline').textContent = fmtMonto(pipeline);
  document.getElementById('footAprobado').textContent = fmtMonto(aprobado);

  attachStageHandlers(editable);
  attachRowActionHandlers();
}

function renderCards() {
  const wrap = document.getElementById('cardsList');
  const editable = canEdit();
  wrap.innerHTML = state.projects.map((p) => {
    const stageChips = STAGES.map((s) => stageMarkHtml(p, s, editable)).join('');
    const fecha = p.fecha_aprobacion;
    return `
      <div class="pcard">
        <div class="pcard-top">
          <div>
            <div class="pcard-title">${PAIS_FLAGS[p.pais] || ''} ${p.apodo}</div>
            <div class="pcard-sub">${p.pais} · <span class="codigo-chip">${p.codigo || '-'}</span></div>
          </div>
          <span class="prob-dot" style="background:${probColor(p.probabilidad)}">${p.probabilidad}</span>
        </div>
        <div class="pcard-badges">
          <span class="estado-tag" style="${estadoTagStyle(p.estado)}">${p.estado}</span>
          <span class="etapa-actual-chip">Etapa actual: ${p.etapa_actual}</span>
        </div>
        <div class="pcard-stages">${stageChips}</div>
        <div class="pcard-grid">
          <div><div class="label">Monto Pipeline</div>${fmtMonto(p.monto_total)}</div>
          <div><div class="label">Aprobado</div>${p.monto_aprobado ? fmtMonto(p.monto_aprobado) : '-'}</div>
          <div class="full" style="grid-column:1/-1">
            <div class="label">Fecha aprobacion</div>
            <button class="fecha-aprob-btn ${fecha ? 'set' : ''}" data-id="${p.id}" data-action="fecha">
              ${fecha ? fmtFecha(fecha) : (editable ? 'Fijar fecha' : 'Sin definir')}
            </button>
          </div>
        </div>
        <div class="pcard-actions">
          ${editable ? `<button class="btn btn-ghost btn-sm" data-action="edit" data-id="${p.id}">Editar</button>` : ''}
          ${isAdmin() ? `<button class="btn btn-sm" style="background:#FCE4E4;color:#B0271B" data-action="delete" data-id="${p.id}">Eliminar</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
  attachStageHandlers(editable);
  attachRowActionHandlers();
}

function attachStageHandlers(editable) {
  if (!editable) return;
  document.querySelectorAll('.stage-mark.editable').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.dataset.projectId;
      const key = el.dataset.stage;
      const project = state.projects.find((p) => String(p.id) === String(id));
      const cur = project[key];
      const next = cur === 'X' ? 'N/C' : cur === 'N/C' ? null : 'X';
      try {
        await api(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify({ [key]: next }) });
        await Promise.all([loadProjects(), loadSummary()]);
      } catch (e) {
        showToast(e.message);
      }
    });
  });
}

function attachRowActionHandlers() {
  document.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });
  document.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => confirmDelete(btn.dataset.id));
  });
  document.querySelectorAll('[data-action="fecha"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!canEdit()) return;
      openEditModal(btn.dataset.id, { focusFecha: true });
    });
  });
}

function renderAll() {
  renderFilterOptions();
  renderTable();
  renderCards();
}

// ---------------- Modal: edit / new project ----------------
function stageEditorHtml(project) {
  return STAGES.map((s) => {
    const val = project[s.key] || '';
    const label = val === 'X' ? 'X' : val === 'N/C' ? 'N/C' : '—';
    return `<button type="button" class="stage-toggle" data-stage="${s.key}" data-val="${val}">${s.label}: ${label}</button>`;
  }).join('');
}

function openEditModal(id, opts = {}) {
  const isNew = !id;
  const project = isNew
    ? { garantia: 'Soberano', pais: 'ARGENTINA', estado: 'SIN CARTA CONSULTA', probabilidad: 'A', prioridad: 1 }
    : Object.assign({}, state.projects.find((p) => String(p.id) === String(id)));
  state.editingProject = project;

  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-overlay" id="overlay">
      <div class="modal">
        <button class="close-x" id="closeModal">✕</button>
        <h2>${isNew ? 'Nuevo proyecto' : project.apodo}</h2>
        <div class="modal-sub">${isNew ? 'Completa los datos del proyecto' : `${project.pais} · ${project.codigo || 'sin codigo'}`}</div>

        <div class="form-grid">
          <div class="form-field"><label>Apodo / Proyecto</label><input id="f_apodo" value="${project.apodo || ''}" /></div>
          <div class="form-field"><label>Codigo</label><input id="f_codigo" value="${project.codigo || ''}" /></div>

          <div class="form-field"><label>Pais</label>
            <select id="f_pais">${Object.keys(PAIS_FLAGS).map((p) => `<option value="${p}" ${project.pais === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
          </div>
          <div class="form-field"><label>Garantia</label>
            <select id="f_garantia">${GARANTIA_OPTIONS.map((g) => `<option value="${g}" ${project.garantia === g ? 'selected' : ''}>${g}</option>`).join('')}</select>
          </div>

          <div class="form-field"><label>Estado</label>
            <select id="f_estado">${ESTADO_OPTIONS.map((e) => `<option value="${e}" ${project.estado === e ? 'selected' : ''}>${e}</option>`).join('')}</select>
          </div>
          <div class="form-field"><label>Probabilidad</label>
            <select id="f_probabilidad">${PROB_OPTIONS.map((p) => `<option value="${p}" ${project.probabilidad === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
          </div>

          <div class="form-field"><label>Prioridad</label><input type="number" id="f_prioridad" value="${project.prioridad ?? 1}" /></div>
          <div class="form-field"><label>Fecha de reporte</label><input type="date" id="f_fecha_reporte" value="${project.fecha_reporte || ''}" /></div>

          <div class="form-field full">
            <label>Etapas del proceso (click para alternar: pendiente / X / N-C)</label>
            <div class="stage-editor" id="stageEditor">${stageEditorHtml(project)}</div>
          </div>

          <div class="form-field"><label>Monto Pipeline (M USD)</label><input type="number" step="0.01" id="f_monto_total" value="${project.monto_total ?? 0}" /></div>
          <div class="form-field"><label>Monto Aprobado (M USD)</label><input type="number" step="0.01" id="f_monto_aprobado" value="${project.monto_aprobado ?? 0}" /></div>

          <div class="form-field"><label>Aprob. 2026</label><input type="number" step="0.01" id="f_aprob_2026" value="${project.aprob_2026 ?? 0}" /></div>
          <div class="form-field"><label>Aprob. 2027</label><input type="number" step="0.01" id="f_aprob_2027" value="${project.aprob_2027 ?? 0}" /></div>
          <div class="form-field"><label>Aprob. 2028</label><input type="number" step="0.01" id="f_aprob_2028" value="${project.aprob_2028 ?? 0}" /></div>
          <div class="form-field"><label>Aprob. 2029</label><input type="number" step="0.01" id="f_aprob_2029" value="${project.aprob_2029 ?? 0}" /></div>

          <div class="form-field"><label>Desemb. 2026</label><input type="number" step="0.01" id="f_desem_2026" value="${project.desem_2026 ?? 0}" /></div>
          <div class="form-field"><label>Desemb. 2027</label><input type="number" step="0.01" id="f_desem_2027" value="${project.desem_2027 ?? 0}" /></div>
          <div class="form-field"><label>Desemb. 2028</label><input type="number" step="0.01" id="f_desem_2028" value="${project.desem_2028 ?? 0}" /></div>
          <div class="form-field"><label>Desemb. 2029</label><input type="number" step="0.01" id="f_desem_2029" value="${project.desem_2029 ?? 0}" /></div>

          <div class="form-field">
            <label>Fecha de aprobacion ${project.estado === 'APROBADO' ? '(requerida)' : ''}</label>
            <input type="date" id="f_fecha_aprobacion" value="${project.fecha_aprobacion || ''}" />
          </div>
          <div class="form-field full"><label>Notas</label><textarea id="f_notas">${project.notas || ''}</textarea></div>
        </div>

        ${!isNew ? `
          <div style="margin-top:14px">
            <button class="btn btn-ghost btn-sm" id="toggleHistory">Ver historial de cambios</button>
            <ul class="history-list" id="historyList" style="display:none"></ul>
          </div>
        ` : ''}

        <div class="modal-footer">
          <button class="btn btn-ghost" id="cancelModal">Cancelar</button>
          <button class="btn btn-primary" id="saveModal" style="background:var(--navy);color:#fff">${isNew ? 'Crear proyecto' : 'Guardar cambios'}</button>
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll('.stage-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cur = btn.dataset.val;
      const next = cur === 'X' ? 'N/C' : cur === 'N/C' ? '' : 'X';
      btn.dataset.val = next;
      const stage = STAGES.find((s) => s.key === btn.dataset.stage);
      btn.textContent = `${stage.label}: ${next === 'X' ? 'X' : next === 'N/C' ? 'N/C' : '—'}`;
    });
  });

  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('cancelModal').addEventListener('click', closeModal);
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
  document.getElementById('saveModal').addEventListener('click', () => saveProjectFromModal(isNew, id));

  if (!isNew) {
    document.getElementById('toggleHistory').addEventListener('click', async (e) => {
      const list = document.getElementById('historyList');
      if (list.style.display === 'none') {
        const hist = await api(`/api/projects/${id}/history`);
        list.innerHTML = hist.length
          ? hist.map((h) => `<li><b>${h.field}</b>: "${h.old_value || '-'}" &rarr; "${h.new_value || '-'}" &middot; ${h.changed_by} &middot; ${new Date(h.changed_at).toLocaleString('es-AR')}</li>`).join('')
          : '<li>Sin cambios registrados.</li>';
        list.style.display = 'block';
        e.target.textContent = 'Ocultar historial';
      } else {
        list.style.display = 'none';
        e.target.textContent = 'Ver historial de cambios';
      }
    });
  }

  if (opts.focusFecha) {
    setTimeout(() => document.getElementById('f_fecha_aprobacion').focus(), 50);
  }
}

function closeModal() {
  document.getElementById('modalRoot').innerHTML = '';
  state.editingProject = null;
}

async function saveProjectFromModal(isNew, id) {
  const body = {
    apodo: document.getElementById('f_apodo').value.trim(),
    codigo: document.getElementById('f_codigo').value.trim(),
    pais: document.getElementById('f_pais').value,
    garantia: document.getElementById('f_garantia').value,
    estado: document.getElementById('f_estado').value,
    probabilidad: document.getElementById('f_probabilidad').value,
    prioridad: Number(document.getElementById('f_prioridad').value || 1),
    fecha_reporte: document.getElementById('f_fecha_reporte').value || null,
    monto_total: Number(document.getElementById('f_monto_total').value || 0),
    monto_aprobado: Number(document.getElementById('f_monto_aprobado').value || 0),
    aprob_2026: Number(document.getElementById('f_aprob_2026').value || 0),
    aprob_2027: Number(document.getElementById('f_aprob_2027').value || 0),
    aprob_2028: Number(document.getElementById('f_aprob_2028').value || 0),
    aprob_2029: Number(document.getElementById('f_aprob_2029').value || 0),
    desem_2026: Number(document.getElementById('f_desem_2026').value || 0),
    desem_2027: Number(document.getElementById('f_desem_2027').value || 0),
    desem_2028: Number(document.getElementById('f_desem_2028').value || 0),
    desem_2029: Number(document.getElementById('f_desem_2029').value || 0),
    fecha_aprobacion: document.getElementById('f_fecha_aprobacion').value || null,
    notas: document.getElementById('f_notas').value,
  };
  if (body.estado === 'APROBADO' && !body.fecha_aprobacion) {
    if (!confirm('Marcaste el proyecto como APROBADO pero no cargaste la fecha de aprobacion. Continuar de todos modos?')) return;
  }
  document.querySelectorAll('.stage-toggle').forEach((btn) => {
    body[btn.dataset.stage] = btn.dataset.val || null;
  });

  try {
    if (isNew) {
      await api('/api/projects', { method: 'POST', body: JSON.stringify(body) });
      showToast('Proyecto creado.');
    } else {
      await api(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('Cambios guardados.');
    }
    closeModal();
    await Promise.all([loadProjects(), loadSummary()]);
  } catch (e) {
    showToast(e.message);
  }
}

async function confirmDelete(id) {
  const project = state.projects.find((p) => String(p.id) === String(id));
  if (!confirm(`Eliminar "${project.apodo}"? Esta accion no se puede deshacer.`)) return;
  try {
    await api(`/api/projects/${id}`, { method: 'DELETE' });
    showToast('Proyecto eliminado.');
    await Promise.all([loadProjects(), loadSummary()]);
  } catch (e) {
    showToast(e.message);
  }
}

// ---------------- Modal: usuarios / roles ----------------
function openUsersModal() {
  const root = document.getElementById('modalRoot');
  const rolesOpts = ['viewer', 'editor', 'admin'];
  root.innerHTML = `
    <div class="modal-overlay" id="overlay">
      <div class="modal">
        <button class="close-x" id="closeModal">✕</button>
        <h2>Usuarios y permisos</h2>
        <div class="modal-sub">Admin: acceso total. Editor (VP / Jefes): puede editar proyectos. Consulta: solo puede ver y solicitar cambios.</div>
        <div id="usersTableWrap"></div>
        <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">
          <div class="form-grid">
            <div class="form-field"><label>Nombre</label><input id="nu_name" /></div>
            <div class="form-field"><label>Email</label><input id="nu_email" /></div>
            <div class="form-field"><label>Rol</label>
              <select id="nu_role">${rolesOpts.map((r) => `<option value="${r}">${r}</option>`).join('')}</select>
            </div>
          </div>
          <button class="btn btn-primary" id="addUserBtn" style="background:var(--navy);color:#fff;margin-top:10px">+ Agregar usuario</button>
        </div>
        <div class="modal-footer"><button class="btn btn-ghost" id="cancelModal">Cerrar</button></div>
      </div>
    </div>
  `;
  const renderUsersTable = () => {
    const wrap = document.getElementById('usersTableWrap');
    wrap.innerHTML = `<table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:8px">
      ${state.users.map((u) => `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:6px 4px">${u.name}</td>
          <td style="padding:6px 4px;color:var(--muted)">${u.email || ''}</td>
          <td style="padding:6px 4px">
            <select data-uid="${u.id}" class="role-select">
              ${rolesOpts.map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
          </td>
        </tr>
      `).join('')}
    </table>`;
    wrap.querySelectorAll('.role-select').forEach((sel) => {
      sel.addEventListener('change', async () => {
        try {
          await api(`/api/users/${sel.dataset.uid}`, { method: 'PUT', body: JSON.stringify({ role: sel.value }) });
          await loadUsers();
          showToast('Rol actualizado.');
        } catch (e) { showToast(e.message); }
      });
    });
  };
  renderUsersTable();

  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('cancelModal').addEventListener('click', closeModal);
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
  document.getElementById('addUserBtn').addEventListener('click', async () => {
    const name = document.getElementById('nu_name').value.trim();
    const email = document.getElementById('nu_email').value.trim();
    const role = document.getElementById('nu_role').value;
    if (!name) { showToast('Falta el nombre.'); return; }
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify({ name, email, role }) });
      await loadUsers();
      renderUsersTable();
      document.getElementById('nu_name').value = '';
      document.getElementById('nu_email').value = '';
      showToast('Usuario agregado.');
    } catch (e) { showToast(e.message); }
  });
}

// ---------------- Modal: solicitar cambio (feedback por correo) ----------------
function openFeedbackModal() {
  const root = document.getElementById('modalRoot');
  const projectOpts = state.projects.map((p) => `<option value="${p.apodo}">${p.pais} - ${p.apodo}</option>`).join('');
  root.innerHTML = `
    <div class="modal-overlay" id="overlay">
      <div class="modal">
        <button class="close-x" id="closeModal">✕</button>
        <h2>Solicitar un cambio</h2>
        <div class="modal-sub">Se abrira tu cliente de correo con el mensaje para que lo envies directamente.</div>
        <div class="form-grid">
          <div class="form-field full"><label>Proyecto relacionado (opcional)</label>
            <select id="fb_project"><option value="">-- General / no aplica --</option>${projectOpts}</select>
          </div>
          <div class="form-field full"><label>Que necesitas cambiar o corregir?</label>
            <textarea id="fb_message" placeholder="Ej: el monto pipeline de RUTA 13 deberia ser 130 M en vez de 120 M..." style="min-height:110px"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cancelModal">Cancelar</button>
          <button class="btn btn-primary" id="sendFeedback" style="background:var(--navy);color:#fff">Abrir correo</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('cancelModal').addEventListener('click', closeModal);
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
  document.getElementById('sendFeedback').addEventListener('click', () => {
    const project = document.getElementById('fb_project').value;
    const message = document.getElementById('fb_message').value.trim();
    if (!message) { showToast('Escribi el pedido antes de enviar.'); return; }
    const to = 'alecoronadosiles@hotmail.com';
    const subject = `[PAO] Solicitud de cambio${project ? ' - ' + project : ''} (de ${state.currentUserName || 'usuario'})`;
    const bodyLines = [
      `Solicitante: ${state.currentUserName || '(sin identificar)'}`,
      project ? `Proyecto: ${project}` : null,
      '',
      message,
    ].filter(Boolean);
    const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
    window.location.href = mailto;
    closeModal();
    showToast('Se abrio tu cliente de correo con el pedido.');
  });
}

// ---------------- Wiring general ----------------
function wireStaticUi() {
  document.getElementById('userSelect').addEventListener('change', (e) => {
    state.currentUserName = e.target.value;
    localStorage.setItem('pao_user_name', state.currentUserName);
    renderUserSelect();
    renderAll();
  });
  document.getElementById('usersBtn').addEventListener('click', openUsersModal);
  document.getElementById('newProjectBtn').addEventListener('click', () => openEditModal(null));
  document.getElementById('feedbackFab').addEventListener('click', openFeedbackModal);
  document.getElementById('filtersToggle').addEventListener('click', () => {
    document.getElementById('filtersGrid').classList.toggle('collapsed');
  });

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  document.getElementById('fSearch').addEventListener('input', debounce((e) => {
    state.filters.search = e.target.value;
    loadProjects();
  }, 300));
  ['fGarantia', 'fEstado', 'fPrioridad', 'fProbabilidad'].forEach((id) => {
    document.getElementById(id).addEventListener('change', (e) => {
      const map = { fGarantia: 'garantia', fEstado: 'estado', fPrioridad: 'prioridad', fProbabilidad: 'probabilidad' };
      state.filters[map[id]] = e.target.value;
      loadProjects();
    });
  });

  const now = new Date();
  document.getElementById('subtitleReport').textContent =
    'Datos en vivo · actualizado ' + now.toLocaleDateString('es-AR') + ' ' + now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  // filtros colapsados por default en mobile
  if (window.innerWidth <= 980) document.getElementById('filtersGrid').classList.add('collapsed');
}

async function init() {
  wireStaticUi();
  try {
    await loadUsers();
    await Promise.all([loadProjects(), loadSummary()]);
  } catch (e) {
    showToast('No se pudo conectar con el servidor: ' + e.message);
  }
}

init();
