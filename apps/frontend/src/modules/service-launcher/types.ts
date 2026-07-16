export type ServiceStatus = 'running' | 'stopped';

export interface ServiceConfig {
  id: string;
  name: string;
  command: string;
  cwd: string;
  icon?: string;
  status: ServiceStatus;
}

export interface ServiceLogs {
  logs: string;
}
