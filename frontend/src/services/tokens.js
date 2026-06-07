import { api } from './api';

export const tokensService = {
  list:   ()         => api.get('/api/tokens'),
  create: (data)     => api.post('/api/tokens', data),
  update: (id, data) => api.put(`/api/tokens/${id}`, data),
  remove: (id)       => api.delete(`/api/tokens/${id}`),
};
