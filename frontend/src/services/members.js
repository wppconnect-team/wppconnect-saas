import { api } from './api';

export const membersService = {
  list:   ()           => api.get('/api/members'),
  invite: (data)       => api.post('/api/members', data),
  update: (id, data)   => api.patch(`/api/members/${id}`, data),
  remove: (id)         => api.delete(`/api/members/${id}`),
};
