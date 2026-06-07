import { api } from './api';

function qs(params) {
  if (!params) return '';
  const p = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''));
  return Object.keys(p).length ? '?' + new URLSearchParams(p) : '';
}

export const contactsService = {
  list:   (params)   => api.get(`/api/contacts${qs(params)}`),
  create: (data)     => api.post('/api/contacts', data),
  update: (id, data) => api.put(`/api/contacts/${id}`, data),
  remove: (id)       => api.delete(`/api/contacts/${id}`),
};
