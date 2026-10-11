// src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'leaflet/dist/leaflet.css'
import './utils/leafletIconFix.js'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'
import { GoogleOAuthProvider } from '@react-oauth/google'

registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload();
  }
});

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '195200639587-v8d2ram47i72psddft6blqrdeieteuu1.apps.googleusercontent.com').trim();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)
