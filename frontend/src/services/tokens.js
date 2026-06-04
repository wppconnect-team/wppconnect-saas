import { api } from './api';

export const tokensService = {
  list:   ()       => api.get('/api/tokens'),
  create: (data)   => api.post('/api/tokens', data),
  remove: (id)     => api.delete(`/api/tokens/${id}`),
};
