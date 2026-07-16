import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { servicesApi } from '../api/servicesApi';

export const servicesKeys = {
  all: ['services'] as const,
  logs: (id: string) => ['services', 'logs', id] as const,
};

export function useServices() {
  return useQuery({
    queryKey: servicesKeys.all,
    queryFn: servicesApi.getServices,
    refetchInterval: 5000,
  });
}

export function useServiceLogs(id: string, enabled: boolean) {
  return useQuery({
    queryKey: servicesKeys.logs(id),
    queryFn: () => servicesApi.getLogs(id),
    refetchInterval: 2000,
    enabled,
  });
}

export function useStartService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: servicesApi.startService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: servicesKeys.all });
    },
  });
}

export function useStopService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: servicesApi.stopService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: servicesKeys.all });
    },
  });
}
