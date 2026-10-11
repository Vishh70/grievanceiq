// src/components/admin/AiSafetyIntelligence.jsx
import React from 'react';
import {
  ShieldAlert, Sparkles, Cpu, Link2, AlertTriangle, CheckCircle2,
  Layers, Info, FileSpreadsheet
} from 'lucide-react';

export default function AiSafetyIntelligence({
  analytics = {},
  summary = {},
  categories = []
}) {
  const avgSeverity = analytics.avgSeverityScore;
  const topHazards = analytics.topSafetyHazards || [];
  const highPriorityCount = summary.highPriority || 0;

  return (
    <div>
      {/* Top Hazard Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        <div className="admin-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <div className="admin-card-header">
            <h3 className="admin-card-title">
              <ShieldAlert size={18} color="#dc2626" />
              <span>Municipal Hazard Exposure</span>
            </h3>
            <span className="admin-badge admin-badge-critical">
              {highPriorityCount} High / Critical
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: avgSeverity >= 7 ? '#dc2626' : '#d97706' }}>
              {avgSeverity != null ? `${avgSeverity} / 10` : 'N/A'}
            </div>
            <span style={{ fontSize: '0.8125rem', color: 'var(--admin-text-muted)' }}>
              Mean Severity Index
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--admin-text-muted)', lineHeight: 1.5 }}>
            Calculated across all complaints assessed by the Generative AI triage pipeline using standardized 1–10 hazard heuristics.
          </p>
        </div>

        <div className="admin-card" style={{ borderLeft: '4px solid #ea580c' }}>
          <div className="admin-card-header">
            <h3 className="admin-card-title">
              <AlertTriangle size={18} color="#ea580c" />
              <span>Top Detected Safety Hazards</span>
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
              {topHazards.length} Flagged Types
            </span>
          </div>

          {topHazards.length === 0 ? (
            <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>
              No critical physical safety hazards currently flagged in active complaints.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {topHazards.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 'var(--admin-radius-sm)',
                    padding: '0.4rem 0.65rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: '#991b1b'
                  }}
                >
                  <span>⚠️ {item.hazard}</span>
                  <span style={{ background: '#dc2626', color: '#ffffff', borderRadius: '10px', padding: '1px 6px', fontSize: '0.7rem' }}>
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Model Inventory Architecture Breakdown */}
      <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <div className="admin-card-header">
          <h3 className="admin-card-title">
            <Cpu size={20} color="var(--admin-primary)" />
            <span>AI & Machine Learning Architecture Overview</span>
          </h3>
          <span className="admin-badge admin-badge-medium" style={{ textTransform: 'none' }}>
            Configured Pipeline Architecture
          </span>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--admin-text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          GrievanceIQ pairs generative language model triage with local sentence embeddings, Python scikit-learn multi-label estimators, and graph-based deduplication algorithms:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {/* Model A: MiniLM */}
          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.35rem', color: 'var(--admin-text-main)' }}>
              <Layers size={16} color="var(--admin-primary)" />
              <span>Model A: MiniLM Embeddings</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--admin-text-muted)', margin: '0 0 0.5rem', lineHeight: 1.4 }}>
              <code>all-MiniLM-L6-v2</code> transforms complaint descriptions into 384-dimensional dense vectors with L2 normalization for vector cosine similarity.
            </p>
            <div style={{ fontSize: '0.72rem', color: 'var(--admin-primary)', fontWeight: 600 }}>
              Architecture: Xenova / Hugging Face Transformers
            </div>
          </div>

          {/* Model B: Multi-Label Classifier */}
          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.35rem', color: 'var(--admin-text-main)' }}>
              <Cpu size={16} color="var(--admin-info)" />
              <span>Model B: Multi-Label Classifier</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--admin-text-muted)', margin: '0 0 0.5rem', lineHeight: 1.4 }}>
              9 independent binary <code>LogisticRegression</code> estimators predict issues against category-specific decision thresholds from <code>multilabel_thresholds.csv</code>.
            </p>
            <div style={{ fontSize: '0.72rem', color: 'var(--admin-info)', fontWeight: 600 }}>
              Architecture: 9 Binary Logistic Regression Estimators
            </div>
          </div>

          {/* Model C: Relationship Classifier */}
          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.35rem', color: 'var(--admin-text-main)' }}>
              <Link2 size={16} color="var(--admin-warning)" />
              <span>Model C: Relationship Classifier</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--admin-text-muted)', margin: '0 0 0.5rem', lineHeight: 1.4 }}>
              10-tree Random Forest evaluating 20 strictly ordered numerical features to classify issue pairs as <em>Duplicate</em>, <em>Similar</em>, <em>Related</em>, or <em>Independent</em>.
            </p>
            <div style={{ fontSize: '0.72rem', color: 'var(--admin-warning)', fontWeight: 600 }}>
              Architecture: 20-Feature Random Forest Classifier
            </div>
          </div>

          {/* Model D: Google Gemini */}
          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.35rem', color: 'var(--admin-text-main)' }}>
              <Sparkles size={16} color="#d97706" />
              <span>Model D: Google Gemini Triage</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--admin-text-muted)', margin: '0 0 0.5rem', lineHeight: 1.4 }}>
              Dynamic model selection (default: <code>gemini-3.8-flash</code>) with automated fallback to <code>gemini-3.5-flash-lite</code> for JSON triage extraction and safety hazard indexing.
            </p>
            <div style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600 }}>
              Architecture: Dual-Model Fallback Engine
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
