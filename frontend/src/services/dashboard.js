import { api } from './api';

export const dashboardService = {
  get: (period = '7d') => api.get(`/api/dashboard?period=${period}`),
};
