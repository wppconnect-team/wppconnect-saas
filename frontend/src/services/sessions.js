import { api } from './api';

function qs(params) {
  if (!params) return '';
  const p = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''));
  return Object.keys(p).length ? '?' + new URLSearchParams(p) : '';
}

export const sessionsService = {
  list:   (params)   => api.get(`/api/sessions${qs(params)}`),
  create: (data)     => api.post('/api/sessions', data),
  update: (id, data) => api.put(`/api/sessions/${id}`, data),
  remove: (id)       => api.delete(`/api/sessions/${id}`),
};
