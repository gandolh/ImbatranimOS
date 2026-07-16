import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import Docker from 'dockerode';

@Injectable()
export class DockerService {
  private docker: Docker;

  constructor() {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  async listContainers() {
    try {
      const containers = await this.docker.listContainers({ all: true });
      return containers.map(c => ({
        id: c.Id,
        names: c.Names,
        image: c.Image,
        state: c.State,
        status: c.Status,
      }));
    } catch (e) {
      throw new InternalServerErrorException(`Failed to list containers: ${e.message}`);
    }
  }

  async startContainer(id: string) {
    try {
      const container = this.docker.getContainer(id);
      await container.start();
      return { success: true };
    } catch (e) {
      throw new InternalServerErrorException(`Failed to start container ${id}: ${e.message}`);
    }
  }

  async stopContainer(id: string) {
    try {
      const container = this.docker.getContainer(id);
      await container.stop();
      return { success: true };
    } catch (e) {
      throw new InternalServerErrorException(`Failed to stop container ${id}: ${e.message}`);
    }
  }

  async restartContainer(id: string) {
    try {
      const container = this.docker.getContainer(id);
      await container.restart();
      return { success: true };
    } catch (e) {
      throw new InternalServerErrorException(`Failed to restart container ${id}: ${e.message}`);
    }
  }

  async removeContainer(id: string) {
    try {
      const container = this.docker.getContainer(id);
      await container.remove();
      return { success: true };
    } catch (e) {
      throw new InternalServerErrorException(`Failed to remove container ${id}: ${e.message}`);
    }
  }

  async getLogs(id: string, limit: number = 100) {
    try {
      const container = this.docker.getContainer(id);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: limit,
      });
      // logs are returned as a Buffer with Docker's multiplexing format
      // but if we use a simple string conversion it might be messy
      // however, container.logs() returns raw buffer if we don't pass follow: true
      return logs.toString('utf-8');
    } catch (e) {
      throw new InternalServerErrorException(`Failed to fetch logs for ${id}: ${e.message}`);
    }
  }
}
