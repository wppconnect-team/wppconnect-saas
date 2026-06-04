import { api } from './api';

export const webhooksService = {
  list:   (params)   => api.get('/api/webhooks' + (params?.status ? `?status=${params.status}` : '')),
  create: (data)     => api.post('/api/webhooks', data),
  update: (id, data) => api.put(`/api/webhooks/${id}`, data),
  remove: (id)       => api.delete(`/api/webhooks/${id}`),
};
