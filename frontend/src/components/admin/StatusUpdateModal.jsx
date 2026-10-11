// src/components/admin/StatusUpdateModal.jsx
import React, { useState } from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

export default function StatusUpdateModal({
  complaint,
  isOpen,
  onClose,
  onSuccess
}) {
  const [newStatus, setNewStatus] = useState(complaint?.status || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen || !complaint) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!newStatus) {
      toast.error('Please select a valid status.');
      return;
    }

    setSaving(true);
    const toastId = toast.loading('Applying status update...');

    try {
      await api.patch(`/complaints/${complaint._id}/status`, {
        status: newStatus,
        note: note.trim()
      });

      toast.success(`Complaint #${(complaint._id || '').slice(-6)} updated to ${newStatus}`, { id: toastId });
      onSuccess();
      onClose();
    } catch (err) {
      const errMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to update status';
      toast.error(errMsg, { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <div
        className="admin-card"
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#ffffff',
          borderRadius: 'var(--admin-radius-lg)',
          boxShadow: 'var(--admin-shadow-lg)',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            color: 'var(--admin-text-muted)',
            cursor: 'pointer',
            padding: 4
          }}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 0.25rem', color: 'var(--admin-text-main)' }}>
          Update Complaint Status
        </h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--admin-text-muted)', marginBottom: '1.25rem' }}>
          Issue #{String(complaint._id || '').slice(-6)}: {complaint.category}
        </p>

        <form onSubmit={handleSave}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
              Operational Status <span style={{ color: 'var(--admin-danger)' }}>*</span>
            </label>
            <select
              className="form-select"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              required
            >
              <option value="">Select Target Status...</option>
              <option value="Pending">Pending (Awaiting Initial Action)</option>
              <option value="In Review">In Review (Under Investigation)</option>
              <option value="In Progress">In Progress (Field Work Active)</option>
              <option value="Resolved">Resolved (Completed & Verified)</option>
              <option value="Rejected">Rejected (Out of Municipal Scope / Invalid)</option>
            </select>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
              Resolution / Action Note (Optional)
            </label>
            <textarea
              className="form-textarea"
              placeholder="Provide context or instructions for citizen and audit log..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ minHeight: 90, fontSize: '0.875rem' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !newStatus}
            >
              {saving ? 'Saving...' : 'Apply Status Change'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
