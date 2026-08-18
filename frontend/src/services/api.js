// src/services/api.js
import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
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
      window.location.href = '/login';
    }
    
    // Handle Render Cold Start / Timeout / Bad Gateway
    if (err.code === 'ECONNABORTED' || err.message === 'Network Error' || err.response?.status >= 500) {
      toast.error('The backend server is waking up or unreachable. Please wait 30 seconds and try again.', { id: 'network-error' });
    }
    
    return Promise.reject(err);
  }
);

export default api;
