// src/components/admin/AnalyticsCharts.jsx
import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar
} from 'recharts';
import { TrendingUp, PieChart as PieIcon, BarChart2, Building2 } from 'lucide-react';

const PRIORITY_COLORS = {
  Critical: '#dc2626',
  High: '#ea580c',
  Medium: '#2563eb',
  Low: '#059669',
  Unknown: '#94a3b8'
};

const CATEGORY_PALETTE = [
  '#4f46e5', '#0284c7', '#059669', '#d97706', '#dc2626',
  '#7c3aed', '#db2777', '#0d9488', '#ca8a04'
];

export default function AnalyticsCharts({
  trendData = [],
  priorityData = [],
  categoryData = [],
  deptData = []
}) {
  return (
    <>
      {/* Row 1: 14-Day Trend and Priority Distribution */}
      <div className="admin-charts-grid-2">
        <div className="admin-card">
          <div className="admin-card-header">
            <h3 className="admin-card-title">
              <TrendingUp size={18} color="var(--admin-primary)" />
              <span>Incoming Issue Volume (14-Day Rolling Window)</span>
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
              {trendData.length > 0 ? `${trendData.reduce((acc, cur) => acc + (cur.count || 0), 0)} Total Received` : 'No recent issues'}
            </span>
          </div>

          <div style={{ height: 260, width: '100%' }}>
            {trendData.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--admin-text-muted)', fontSize: '0.875rem' }}>
                No trend data recorded in the last 14 days.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)',
                      fontSize: '0.8125rem'
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Complaints"
                    stroke="#4f46e5"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#4f46e5' }}
                    activeDot={{ r: 5, fill: '#4338ca' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <h3 className="admin-card-title">
              <PieIcon size={18} color="var(--admin-warning)" />
              <span>Priority Distribution</span>
            </h3>
          </div>

          <div style={{ height: 260, width: '100%' }}>
            {priorityData.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--admin-text-muted)', fontSize: '0.875rem' }}>
                No complaints recorded.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={priorityData}
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                    nameKey="name"
                  >
                    {priorityData.map((entry, index) => (
                      <Cell
                        key={`priority-cell-${index}`}
                        fill={PRIORITY_COLORS[entry.name] || '#94a3b8'}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)',
                      fontSize: '0.8125rem'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.85rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            {priorityData.map((p, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#475569', fontWeight: 600 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLORS[p.name] || '#94a3b8' }} />
                {p.name}: {p.value}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Category Breakdown and Department Workload */}
      <div className="admin-charts-grid-equal">
        <div className="admin-card">
          <div className="admin-card-header">
            <h3 className="admin-card-title">
              <BarChart2 size={18} color="var(--admin-info)" />
              <span>Issue Categories</span>
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
              {categoryData.length} Identified Types
            </span>
          </div>

          <div style={{ height: 260, width: '100%' }}>
            {categoryData.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--admin-text-muted)', fontSize: '0.875rem' }}>
                No category data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical" margin={{ top: 5, right: 20, left: 40, bottom: 5 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#334155' }} tickLine={false} axisLine={false} width={80} />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)',
                      fontSize: '0.8125rem'
                    }}
                  />
                  <Bar dataKey="value" name="Complaints" radius={[0, 4, 4, 0]}>
                    {categoryData.map((_, index) => (
                      <Cell key={`cat-cell-${index}`} fill={CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <h3 className="admin-card-title">
              <Building2 size={18} color="var(--admin-primary)" />
              <span>Department Workload</span>
            </h3>
          </div>

          <div style={{ height: 260, width: '100%' }}>
            {deptData.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--admin-text-muted)', fontSize: '0.875rem' }}>
                No department assignments yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptData} margin={{ top: 10, right: 20, left: -20, bottom: 25 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)',
                      fontSize: '0.8125rem'
                    }}
                  />
                  <Bar dataKey="value" name="Assigned Issues" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
