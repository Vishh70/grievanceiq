// frontend/e2e/fixtures/mockData.js
// Authoritative API response fixtures conforming to backend controllers

export const mockCitizenUser = {
  id: 'cit-uuid-1',
  name: 'Citizen Test User',
  email: 'citizen@example.com',
  role: 'citizen'
};

export const mockAdminUser = {
  id: 'adm-uuid-1',
  name: 'System Admin',
  email: 'admin@grievanceiq.com',
  role: 'admin'
};

export const mockComplaints = [
  {
    _id: 'cmp-uuid-101',
    citizenId: { _id: 'cit-uuid-1', name: 'Citizen Test User', email: 'citizen@example.com' },
    title: 'Deep Pothole on FC Road',
    text: 'Large road crater near bus stop creating vehicle hazard',
    category: 'Roads',
    priority: 'High',
    status: 'Pending',
    recommendedDepartment: 'Road Maintenance',
    department_id: 'Road Maintenance',
    location: { lat: 18.5204, lng: 73.8567, address: 'FC Road, Deccan, Pune' },
    mlLabels: ['road_damage_flag'],
    mlProbabilities: { 'Road Damage': 0.89 },
    mlDepartments: ['Road Maintenance'],
    severityScore: 8,
    safetyHazards: ['Traffic disruption', 'Tire damage risk'],
    statusHistory: [
      { status: 'Pending', note: 'Grievance submitted by citizen', date: new Date().toISOString() }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    _id: 'cmp-uuid-102',
    citizenId: { _id: 'cit-uuid-2', name: 'Ramesh K', email: 'ramesh@example.com' },
    title: 'Burst Pipeline Flooding Street',
    text: 'Water main pipeline break flooding road pathway',
    category: 'Water Supply',
    priority: 'Critical',
    status: 'In Review',
    recommendedDepartment: 'Water Department',
    department_id: 'Water Department',
    location: { lat: 18.5215, lng: 73.8575, address: 'JM Road, Shivajinagar, Pune' },
    mlLabels: ['water_leakage_flag', 'roadside_flooding_flag'],
    mlProbabilities: { 'Water Leakage': 0.94, 'Roadside Flooding': 0.81 },
    mlDepartments: ['Water Department'],
    severityScore: 9,
    safetyHazards: ['Pedestrian slip hazard', 'Road erosion'],
    statusHistory: [
      { status: 'Pending', note: 'Initial filing', date: new Date(Date.now() - 52 * 3600 * 1000).toISOString() },
      { status: 'In Review', note: 'Assigned to field inspector', date: new Date(Date.now() - 50 * 3600 * 1000).toISOString() }
    ],
    // 52 hours old -> triggers SLA Breach in active workload
    createdAt: new Date(Date.now() - 52 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 50 * 3600 * 1000).toISOString()
  },
  {
    _id: 'cmp-uuid-103',
    citizenId: { _id: 'cit-uuid-3', name: 'Anita P', email: 'anita@example.com' },
    title: 'Exposed Electrical Transformer Wires',
    text: 'Live exposed wires hanging from street transformer box',
    category: 'Electricity',
    priority: 'Critical',
    status: 'Assigned',
    recommendedDepartment: 'Electricity Board',
    department_id: 'Electricity Board',
    location: { lat: 18.5225, lng: 73.8585, address: 'Station Road, Pune' },
    mlLabels: ['electric_pole_flag'],
    mlProbabilities: { 'Electric Pole': 0.92 },
    mlDepartments: ['Electricity Board'],
    severityScore: 10,
    safetyHazards: ['High voltage electrocution hazard'],
    statusHistory: [
      { status: 'Pending', note: 'Urgent filing', date: new Date().toISOString() },
      { status: 'Assigned', note: 'Dispatched emergency squad', date: new Date().toISOString() }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    _id: 'cmp-uuid-104',
    citizenId: { _id: 'cit-uuid-4', name: 'Sunil M', email: 'sunil@example.com' },
    title: 'Overflowing Municipal Garbage Dumpster',
    text: 'Solid waste overflowing into market street',
    category: 'Sanitation',
    priority: 'Medium',
    status: 'Resolved',
    recommendedDepartment: 'Sanitation Department',
    department_id: 'Sanitation Department',
    location: { lat: 18.5235, lng: 73.8595, address: 'Karve Road, Kothrud, Pune' },
    mlLabels: ['garbage_flag'],
    mlProbabilities: { 'Garbage': 0.85 },
    mlDepartments: ['Sanitation Department'],
    severityScore: 4,
    safetyHazards: ['Odor and sanitary concern'],
    statusHistory: [
      { status: 'Pending', note: 'Reported', date: new Date(Date.now() - 24 * 3600 * 1000).toISOString() },
      { status: 'Resolved', note: 'Dumpster cleared and sanitized', date: new Date().toISOString() }
    ],
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const mockDashboardSummary = {
  summary: {
    total: 4,
    pending: 3,
    resolved: 1,
    highPriority: 3,
    resolutionRate: '25.0%'
  },
  analytics: {
    activeSlaBreaches: 1,
    resolvedWithinSla: 1,
    averageResolutionHours: 24,
    averageSeverityScore: 7.7
  },
  categoryBreakdown: [
    { name: 'Roads', count: 1 },
    { name: 'Water Supply', count: 1 },
    { name: 'Electricity', count: 1 },
    { name: 'Sanitation', count: 1 }
  ],
  priorityBreakdown: [
    { priority: 'Critical', count: 2 },
    { priority: 'High', count: 1 },
    { priority: 'Medium', count: 1 }
  ],
  departmentBreakdown: [
    { name: 'Road Maintenance', count: 1 },
    { name: 'Water Department', count: 1 },
    { name: 'Electricity Board', count: 1 },
    { name: 'Sanitation Department', count: 1 }
  ],
  trend: [
    { date: new Date().toISOString().split('T')[0], count: 3 }
  ],
  mapPins: [
    {
      _id: 'cmp-uuid-101',
      category: 'Roads',
      priority: 'High',
      severityScore: 8,
      status: 'Pending',
      text: 'Deep Pothole on FC Road',
      location: { lat: 18.5204, lng: 73.8567, address: 'FC Road, Deccan, Pune' },
      createdAt: new Date().toISOString()
    }
  ]
};
