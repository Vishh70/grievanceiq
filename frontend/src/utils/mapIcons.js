import L from 'leaflet';

/**
 * Generates a high-contrast, modern SVG DivIcon with a pulsing anchor ring.
 * Eliminates broken PNG asset dependencies and renders crisply on all displays.
 */
export function createPinIcon(color = '#6366f1', size = 36) {
  const height = size * 1.25;
  const svgHtml = `
    <div class="custom-leaflet-marker" style="
      position: relative;
      width: ${size}px;
      height: ${height}px;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <!-- Pulsing Beacon Effect at Ground Anchor -->
      <div style="
        position: absolute;
        bottom: 0px;
        left: 50%;
        transform: translateX(-50%);
        width: 14px;
        height: 14px;
        background: ${color};
        border-radius: 50%;
        opacity: 0.8;
        animation: pin-pulse 2s infinite ease-out;
      "></div>
      
      <!-- Crisp SVG Pin -->
      <svg width="${size}" height="${height}" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg" style="
        position: absolute;
        top: 0;
        left: 0;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.35));
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      ">
        <path d="M16 0C7.163 0 0 7.163 0 16c0 10.5 14.2 23.1 14.8 23.6a1.8 1.8 0 0 0 2.4 0C17.8 39.1 32 26.5 32 16 32 7.163 24.837 0 16 0Z" fill="${color}"/>
        <circle cx="16" cy="15" r="7" fill="#ffffff"/>
        <circle cx="16" cy="15" r="4" fill="${color}"/>
      </svg>
    </div>
  `;

  return L.divIcon({
    html: svgHtml,
    className: 'custom-map-pin',
    iconSize: [size, height],
    iconAnchor: [size / 2, height],
    popupAnchor: [0, -height + 4],
  });
}

export const PRIORITY_MAP_COLORS = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#3b82f6',
  Low: '#10b981',
};

export function getPriorityIcon(priority = 'Medium') {
  const color = PRIORITY_MAP_COLORS[priority] || PRIORITY_MAP_COLORS.Medium;
  return createPinIcon(color, 34);
}

/**
 * Custom pulsing blue radar dot for user's current GPS location.
 */
export function createUserLocationIcon() {
  const html = `
    <div style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
      <div style="
        position: absolute;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(59, 130, 246, 0.35);
        animation: pin-pulse 1.8s infinite ease-out;
      "></div>
      <div style="
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #2563eb;
        border: 2.5px solid #ffffff;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      "></div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'user-gps-pin',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}

