// src/services/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('giq_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally — clear auth and redirect
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('giq_token');
      localStorage.removeItem('giq_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
