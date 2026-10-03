// src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'leaflet/dist/leaflet.css'
import './utils/leafletIconFix.js'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'
import { GoogleOAuthProvider } from '@react-oauth/google'

// Explicitly register the service worker for PWA to satisfy browser installation criteria
registerSW({ immediate: true });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || 'dummy_client_id'}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)
