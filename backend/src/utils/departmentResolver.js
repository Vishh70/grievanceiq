// backend/src/utils/departmentResolver.js
// Canonical municipal department resolution for GrievanceIQ

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CANONICAL_DEPARTMENTS = [
  'Road Department',
  'Sanitation Department',
  'Electricity Department',
  'Traffic Department',
  'Water Department',
  'Drainage Department',
  'Garden Department'
];

const CATEGORY_TO_DEPARTMENT = {
  'Roads': 'Road Department',
  'Road Damage': 'Road Department',
  'Water Supply': 'Water Department',
  'Water Leakage': 'Water Department',
  'Electricity': 'Electricity Department',
  'Electric Pole': 'Electricity Department',
  'Streetlight': 'Electricity Department',
  'Drainage': 'Drainage Department',
  'Roadside Flooding': 'Drainage Department',
  'Waste Management': 'Sanitation Department',
  'Garbage': 'Sanitation Department',
  'Traffic Signal': 'Traffic Department',
  'Tree Hazard': 'Garden Department',
  'Public Infrastructure': 'Road Department'
};

/**
 * Resolves a list of recommended department names for a complaint.
 * 
 * @param {object} params
 * @param {string[]} [params.mlDepartments]
 * @param {string} [params.category]
 * @param {string} [params.aiRecommendedDepartment]
 * @returns {string[]}
 */
function resolveRecommendedDepartments({ mlDepartments = [], category = null, aiRecommendedDepartment = null } = {}) {
  const depts = new Set();

  if (Array.isArray(mlDepartments)) {
    for (const d of mlDepartments) {
      if (typeof d === 'string' && d.trim().length > 0 && d !== 'Review Required') {
        depts.add(d.trim());
      }
    }
  }

  if (depts.size === 0) {
    if (category && CATEGORY_TO_DEPARTMENT[category]) {
      depts.add(CATEGORY_TO_DEPARTMENT[category]);
    } else if (aiRecommendedDepartment && CANONICAL_DEPARTMENTS.includes(aiRecommendedDepartment)) {
      depts.add(aiRecommendedDepartment);
    }
  }

  return Array.from(depts);
}

/**
 * Resolves the display department string for admin dashboard and API responses.
 * 
 * @param {object} row - Database complaint row or mapped complaint object
 * @returns {string|null}
 */
function resolveDisplayDepartment(row) {
  if (!row) return null;

  // 1. Official assignment if non-UUID text
  if (row.department_id && !UUID_REGEX.test(row.department_id)) {
    return row.department_id;
  }

  // 2. ML recommended departments array
  const mlDepts = row.ml_departments || row.mlDepartments;
  if (Array.isArray(mlDepts) && mlDepts.length > 0) {
    const valid = mlDepts.filter(d => typeof d === 'string' && d.trim().length > 0);
    if (valid.length > 0) {
      return valid.join(', ');
    }
  }

  // 2b. Fallback to ml_labels resolution
  const mlLabels = row.ml_labels || row.mlLabels;
  if (Array.isArray(mlLabels) && mlLabels.length > 0) {
    const fromLabels = mlLabels
      .map(lbl => CATEGORY_TO_DEPARTMENT[lbl])
      .filter(Boolean);
    if (fromLabels.length > 0) {
      return Array.from(new Set(fromLabels)).join(', ');
    }
  }

  // 3. Fallback to category deterministic mapping
  const cat = row.category;
  if (cat && CATEGORY_TO_DEPARTMENT[cat]) {
    return CATEGORY_TO_DEPARTMENT[cat];
  }

  // 4. Official department UUID fallback
  if (row.department_id) {
    return 'Municipal General';
  }

  return null;
}

/**
 * Direct mapping helper from category name to department name
 */
function resolveDepartmentFromCategory(category) {
  if (!category || typeof category !== 'string') return null;
  return CATEGORY_TO_DEPARTMENT[category] || null;
}

module.exports = {
  CANONICAL_DEPARTMENTS,
  CATEGORY_TO_DEPARTMENT,
  resolveDepartmentFromCategory,
  resolveRecommendedDepartments,
  resolveDisplayDepartment,
  UUID_REGEX
};
