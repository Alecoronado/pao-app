// Los 5 roles de la app. El login es por rol (cuenta compartida), no por persona.
const ROLES = [
  { slug: 'desarrollador', label: 'Desarrollador' },
  { slug: 'vp', label: 'VP' },
  { slug: 'jefe_cartera', label: 'Jefe Cartera' },
  { slug: 'jefe_soberano', label: 'Jefe Soberano' },
  { slug: 'asesor_senior', label: 'Asesor Senior' },
];

const ROLE_SLUGS = ROLES.map((r) => r.slug);
const ROLE_LABELS = Object.fromEntries(ROLES.map((r) => [r.slug, r.label]));

function isDeveloper(role) {
  return role === 'desarrollador';
}

module.exports = { ROLES, ROLE_SLUGS, ROLE_LABELS, isDeveloper };
