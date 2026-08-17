// src/components/Skeleton.jsx
export default function Skeleton({ className = '', style = {} }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        ...style,
        background: 'linear-gradient(90deg, var(--bg-card) 25%, var(--bg-secondary) 50%, var(--bg-card) 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-loading 1.5s infinite',
        borderRadius: style.borderRadius || 'var(--radius-sm)'
      }}
    />
  );
}
