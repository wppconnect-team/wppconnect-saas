import { api } from './api';

export const planService = {
  get: () => api.get('/api/plan'),
};
