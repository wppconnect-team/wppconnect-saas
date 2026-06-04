import { api } from './api';

export const authService = {
  login:  (email, password, turnstileToken) =>
    api.post('/api/auth/login', { email, password, turnstileToken }),
  me:     () => api.get('/api/auth/me'),
  logout: () => api.post('/api/auth/logout', {}),
};
