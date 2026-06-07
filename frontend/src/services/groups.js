import { api } from './api';

function qs(params) {
  if (!params) return '';
  const p = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''));
  return Object.keys(p).length ? '?' + new URLSearchParams(p) : '';
}

export const groupsService = {
  list:   (params)   => api.get(`/api/groups${qs(params)}`),
  create: (data)     => api.post('/api/groups', data),
  update: (id, data) => api.put(`/api/groups/${id}`, data),
  remove: (id)       => api.delete(`/api/groups/${id}`),
};
