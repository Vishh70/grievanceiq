// src/services/api.js
import axios from 'axios';
import toast from 'react-hot-toast';

export function resolveBaseUrl() {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl) return '/api';

  // Handle any multi-line or whitespace formatted strings from deployment environments
  const cleaned = envUrl
    .split(/[\r\n,\s]+/)
    .map((s) => s.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, ''))
    .find((s) => /^https?:\/\//i.test(s));

  return cleaned || '/api';
}

const api = axios.create({
  baseURL: resolveBaseUrl(),
  timeout: 45000, // 45 seconds to allow for Render free-tier cold starts
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('giq_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally and network timeouts
api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Handle Unauthorized
    if (err.response?.status === 401) {
      localStorage.removeItem('giq_token');
      localStorage.removeItem('giq_user');

      const isAuthPath =
        window.location.pathname === '/login' ||
        window.location.pathname === '/admin/login' ||
        window.location.pathname === '/register';

      if (!isAuthPath) {
        if (window.location.pathname.startsWith('/admin')) {
          window.location.href = '/admin/login';
        } else {
          window.location.href = '/login';
        }
      }
    }

    // Handle Render Cold Start / Timeout / Bad Gateway
    const isColdStartError =
      err.response?.status === 502 ||
      err.response?.status === 503 ||
      err.response?.status === 504;
    if (err.code === 'ECONNABORTED' || err.message === 'Network Error' || isColdStartError) {
      toast.error('The backend server is waking up or unreachable. Please wait 30 seconds and try again.', {
        id: 'network-error',
      });
    }

    return Promise.reject(err);
  }
);

export default api;
