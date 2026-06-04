import { api } from './api';

function qs(params) {
  if (!params) return '';
  const p = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''));
  return Object.keys(p).length ? '?' + new URLSearchParams(p) : '';
}

export const logsService = {
  list: (params) => api.get(`/api/logs${qs(params)}`),
};
