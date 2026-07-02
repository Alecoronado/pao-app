// Definicion de las etapas del proceso y lógica de "etapa actual".
// Pedido del usuario (punto 4): la etapa actual NO es la última tildada,
// sino la primera etapa pendiente en la secuencia.

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

function computeEtapaActual(project) {
  const vals = STAGES.map((s) => project[s.key]);
  const allNC = vals.length > 0 && vals.every((v) => v === 'N/C');

  if (project.estado === 'APROBADO') return 'Aprobado';
  if (allNC) return 'N/C';

  // Primera etapa que todavía no está completada (ni tildada 'X' ni 'N/C').
  // Esto evita que un tilde suelto mas adelante en la secuencia haga
  // parecer que el proyecto avanzo mas de lo que realmente avanzo.
  const firstPendingIdx = vals.findIndex((v) => v !== 'X' && v !== 'N/C');

  if (firstPendingIdx === -1) return 'Aprobación'; // todas las etapas completadas o N/C
  return STAGES[firstPendingIdx].label;
}

module.exports = { STAGES, computeEtapaActual };
