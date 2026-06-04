import { api } from './api';

export const dashboardService = {
  get: () => api.get('/api/dashboard'),
};
