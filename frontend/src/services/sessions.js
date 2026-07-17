import { api } from './api';

function qs(params) {
  if (!params) return '';
  const p = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''));
  return Object.keys(p).length ? '?' + new URLSearchParams(p) : '';
}

export const sessionsService = {
  list:   (params)   => api.get(`/api/sessions${qs(params)}`),
  get:    (id)       => api.get(`/api/sessions/${id}`),
  create: (data)     => api.post('/api/sessions', data),
  start:  (id, data) => api.post(`/api/sessions/${id}/start`, data ?? {}),
  status: (id)       => api.get(`/api/sessions/${id}/status`),
  qrcode: (id)       => api.get(`/api/sessions/${id}/qrcode`),
  sendMessage: (id, data) => api.post(`/api/sessions/${id}/send-message`, data),
  update: (id, data) => api.put(`/api/sessions/${id}`, data),
  remove: (id)       => api.delete(`/api/sessions/${id}`),
};
