import { api } from '../../../lib/axios';
import type { ServiceConfig, ServiceLogs } from '../types';

export const servicesApi = {
  getServices: async () => {
    const { data } = await api.get<ServiceConfig[]>('/services');
    return data;
  },

  startService: async (id: string) => {
    const { data } = await api.post(`/services/${id}/start`);
    return data;
  },

  stopService: async (id: string) => {
    const { data } = await api.post(`/services/${id}/stop`);
    return data;
  },

  getLogs: async (id: string) => {
    const { data } = await api.get<ServiceLogs>(`/services/${id}/logs`);
    return data;
  },
};
