import { api } from './api';

export const planService = {
  get:     ()             => api.get('/api/plan'),
  upgrade: (plan, cycle)  => api.post('/api/plan/upgrade', { plan, cycle }),
  cancel:  ()             => api.post('/api/plan/cancel', {}),
};
