// Los 7 roles de la app. El login es por rol (cuenta compartida), no por persona.
const ROLES = [
  { slug: 'desarrollador', label: 'Desarrollador' },
  { slug: 'vp', label: 'VP' },
  { slug: 'jefe_servicios_operativos', label: 'Jefe Servicios Operativos' },
  { slug: 'jefe_soberano', label: 'Jefe Soberano' },
  { slug: 'jefe_no_soberano', label: 'Jefe No Soberano' },
  { slug: 'analista_vpo', label: 'Analista VPO' },
  { slug: 'gcr', label: 'GCR' },
];

const ROLE_SLUGS = ROLES.map((r) => r.slug);
const ROLE_LABELS = Object.fromEntries(ROLES.map((r) => [r.slug, r.label]));

function isDeveloper(role) {
  return role === 'desarrollador';
}

module.exports = { ROLES, ROLE_SLUGS, ROLE_LABELS, isDeveloper };
