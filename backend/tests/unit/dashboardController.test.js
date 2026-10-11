// backend/tests/unit/dashboardController.test.js
const { ACTIVE_STATUSES, SLA_HOURS, resolveDepartmentName } = require('../../src/controllers/dashboardController');

describe('Dashboard Controller & SLA Reconciliation Unit Tests', () => {
  describe('SLA Constants & Active Status Definitions', () => {
    it('defines ACTIVE_STATUSES to include Pending, In Review, and Assigned consistently', () => {
      expect(ACTIVE_STATUSES).toEqual(['Pending', 'In Review', 'Assigned']);
      expect(ACTIVE_STATUSES).toContain('Assigned');
      expect(ACTIVE_STATUSES).toContain('Pending');
      expect(ACTIVE_STATUSES).toContain('In Review');
      expect(ACTIVE_STATUSES).not.toContain('Resolved');
      expect(ACTIVE_STATUSES).not.toContain('Rejected');
    });

    it('defines SLA_HOURS as 48 hours threshold', () => {
      expect(SLA_HOURS).toBe(48);
    });
  });

  describe('resolveDepartmentName', () => {
    it('returns human-readable department_id when present as text name', () => {
      const complaint = {
        department_id: 'Road Department',
        ml_departments: ['Road Department']
      };
      expect(resolveDepartmentName(complaint)).toBe('Road Department');
    });

    it('falls back to ml_departments[0] when department_id is a UUID', () => {
      const complaint = {
        department_id: '123e4567-e89b-12d3-a456-426614174000',
        ml_departments: ['Water Department', 'Drainage Department']
      };
      expect(resolveDepartmentName(complaint)).toBe('Water Department');
    });

    it('falls back to Municipal General when department_id is a UUID and ml_departments is empty', () => {
      const complaint = {
        department_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        ml_departments: []
      };
      expect(resolveDepartmentName(complaint)).toBe('Municipal General');
    });

    it('resolves from ml_departments when department_id is null', () => {
      const complaint = {
        department_id: null,
        ml_departments: ['Drainage Department']
      };
      expect(resolveDepartmentName(complaint)).toBe('Drainage Department');
    });

    it('returns Unassigned when both department_id and ml_departments are absent', () => {
      const complaint = {
        department_id: null,
        ml_departments: null
      };
      expect(resolveDepartmentName(complaint)).toBe('Unassigned');
    });
  });

  describe('SLA Breach Classification Logic', () => {
    const MS_PER_HOUR = 60 * 60 * 1000;
    const now = Date.now();

    it('classifies Assigned complaints older than 48 hours as SLA breaches', () => {
      const assignedOldComplaint = {
        status: 'Assigned',
        created_at: new Date(now - 50 * MS_PER_HOUR).toISOString()
      };

      const isActive = ACTIVE_STATUSES.includes(assignedOldComplaint.status);
      const hoursPending = (now - new Date(assignedOldComplaint.created_at).getTime()) / MS_PER_HOUR;
      const isBreached = isActive && hoursPending > SLA_HOURS;

      expect(isActive).toBe(true);
      expect(isBreached).toBe(true);
    });

    it('does not classify recently Assigned complaints as SLA breaches', () => {
      const assignedRecentComplaint = {
        status: 'Assigned',
        created_at: new Date(now - 12 * MS_PER_HOUR).toISOString()
      };

      const isActive = ACTIVE_STATUSES.includes(assignedRecentComplaint.status);
      const hoursPending = (now - new Date(assignedRecentComplaint.created_at).getTime()) / MS_PER_HOUR;
      const isBreached = isActive && hoursPending > SLA_HOURS;

      expect(isActive).toBe(true);
      expect(isBreached).toBe(false);
    });

    it('does not classify Resolved or Rejected complaints as SLA breaches regardless of age', () => {
      const resolvedOldComplaint = {
        status: 'Resolved',
        created_at: new Date(now - 100 * MS_PER_HOUR).toISOString()
      };
      const rejectedOldComplaint = {
        status: 'Rejected',
        created_at: new Date(now - 200 * MS_PER_HOUR).toISOString()
      };

      expect(ACTIVE_STATUSES.includes(resolvedOldComplaint.status)).toBe(false);
      expect(ACTIVE_STATUSES.includes(rejectedOldComplaint.status)).toBe(false);
    });
  });
});
