const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');
const { getSnapshotDir, getTimestamp } = require('../utils/helpers');

class DockerSnapshot {
  constructor() {
    this.snapshotDir = getSnapshotDir();
  }

  async init() {
    await fs.ensureDir(this.snapshotDir);
  }

  async isDockerAvailable() {
    try {
      await this.runCommand('docker info');
      return true;
    } catch (e) {
      return false;
    }
  }

  async getContainers() {
    const containers = [];
    try {
      const result = await this.runCommand('docker ps -a --format "{{json .}}"');
      if (result) {
        for (const line of result.split('\n').filter(l => l)) {
          try {
            const container = JSON.parse(line);
            containers.push({
              id: container.ID,
              name: container.Names,
              image: container.Image,
              status: container.Status,
              state: container.State,
              ports: container.Ports,
              created: container.CreatedAt,
              command: container.Command
            });
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    } catch (e) {
      logger.warning('Could not get Docker containers');
    }
    return containers;
  }

  async getContainerDetails(containerId) {
    const details = {
      id: containerId,
      env: [],
      volumes: [],
      networks: [],
      ports: [],
      labels: {}
    };
    
    try {
      const envResult = await this.runCommand(`docker exec ${containerId} env`);
      if (envResult) {
        details.env = envResult.split('\n').filter(l => l && l.includes('='));
      }
      
      const volumeResult = await this.runCommand(`docker inspect ${containerId} --format "{{json .Mounts}}"`);
      if (volumeResult) {
        try {
          const mounts = JSON.parse(volumeResult);
          details.volumes = mounts.map(m => ({
            source: m.Source,
            destination: m.Destination,
            mode: m.Mode,
            type: m.Type
          }));
        } catch (e) {}
      }
      
      const networkResult = await this.runCommand(`docker inspect ${containerId} --format "{{json .NetworkSettings.Networks}}"`);
      if (networkResult) {
        try {
          const networks = JSON.parse(networkResult);
          details.networks = Object.keys(networks).map(key => ({
            name: key,
            ipAddress: networks[key].IPAddress,
            gateway: networks[key].Gateway,
            macAddress: networks[key].MacAddress
          }));
        } catch (e) {}
      }
      
      const portsResult = await this.runCommand(`docker inspect ${containerId} --format "{{json .NetworkSettings.Ports}}"`);
      if (portsResult) {
        try {
          const ports = JSON.parse(portsResult);
          details.ports = Object.keys(ports).map(key => ({
            containerPort: key,
            hostPorts: ports[key] ? ports[key].map(p => p.HostPort) : []
          }));
        } catch (e) {}
      }
      
      const labelResult = await this.runCommand(`docker inspect ${containerId} --format "{{json .Config.Labels}}"`);
      if (labelResult) {
        try {
          details.labels = JSON.parse(labelResult);
        } catch (e) {}
      }
    } catch (e) {
      logger.warning(`Could not get details for container ${containerId}`);
    }
    
    return details;
  }

  async getVolumes() {
    const volumes = [];
    try {
      const result = await this.runCommand('docker volume ls --format "{{json .}}"');
      if (result) {
        for (const line of result.split('\n').filter(l => l)) {
          try {
            const volume = JSON.parse(line);
            volumes.push({
              name: volume.Name,
              driver: volume.Driver,
              mountpoint: volume.Mountpoint
            });
          } catch (e) {}
        }
      }
    } catch (e) {
      logger.warning('Could not get Docker volumes');
    }
    return volumes;
  }

  async getNetworks() {
    const networks = [];
    try {
      const result = await this.runCommand('docker network ls --format "{{json .}}"');
      if (result) {
        for (const line of result.split('\n').filter(l => l)) {
          try {
            const network = JSON.parse(line);
            networks.push({
              id: network.ID,
              name: network.Name,
              driver: network.Driver,
              scope: network.Scope
            });
          } catch (e) {}
        }
      }
    } catch (e) {
      logger.warning('Could not get Docker networks');
    }
    return networks;
  }

  async captureState() {
    const state = {
      containers: [],
      volumes: [],
      networks: [],
      capturedAt: new Date().toISOString()
    };
    
    const available = await this.isDockerAvailable();
    if (!available) {
      throw new Error('Docker is not available');
    }
    
    const containers = await this.getContainers();
    for (const container of containers) {
      const details = await this.getContainerDetails(container.id);
      state.containers.push({ ...container, details });
    }
    
    state.volumes = await this.getVolumes();
    state.networks = await this.getNetworks();
    
    return state;
  }

  async saveSnapshot(name) {
    await this.init();
    
    const timestamp = getTimestamp();
    const snapshotName = name ? `${timestamp}_${name}` : timestamp;
    const snapshotPath = path.join(this.snapshotDir, snapshotName);
    
    await fs.ensureDir(snapshotPath);
    
    logger.progress('Capturing Docker state...');
    const state = await this.captureState();
    
    await fs.writeJson(path.join(snapshotPath, 'state.json'), state, { spaces: 2 });
    
    logger.success(`Saved ${state.containers.length} containers, ${state.volumes.length} volumes, ${state.networks.length} networks`);
    
    return { name: snapshotName, path: snapshotPath, state };
  }

  async loadSnapshot(name) {
    const snapshotPath = path.join(this.snapshotDir, name);
    
    if (!await fs.pathExists(snapshotPath)) {
      throw new Error(`Snapshot "${name}" not found`);
    }
    
    return await fs.readJson(path.join(snapshotPath, 'state.json'));
  }

  async listSnapshots() {
    await this.init();
    
    const entries = await fs.readdir(this.snapshotDir, { withFileTypes: true });
    const snapshots = [];
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const statePath = path.join(this.snapshotDir, entry.name, 'state.json');
        if (await fs.pathExists(statePath)) {
          const state = await fs.readJson(statePath);
          const stats = await fs.stat(path.join(this.snapshotDir, entry.name));
          snapshots.push({
            name: entry.name,
            createdAt: state.capturedAt,
            containers: state.containers.length,
            volumes: state.volumes.length,
            networks: state.networks.length,
            size: stats.size
          });
        }
      }
    }
    
    snapshots.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return snapshots;
  }

  async restoreContainers(containers) {
    for (const container of containers) {
      try {
        if (container.state === 'running') {
          await this.runCommand(`docker start ${container.id}`);
          logger.success(`Started container: ${container.name}`);
        }
      } catch (e) {
        logger.error(`Failed to restore container ${container.name}: ${e.message}`);
      }
    }
  }

  async deleteSnapshot(name) {
    const snapshotPath = path.join(this.snapshotDir, name);
    if (!await fs.pathExists(snapshotPath)) {
      throw new Error(`Snapshot "${name}" not found`);
    }
    await fs.remove(snapshotPath);
    logger.success(`Deleted snapshot: ${name}`);
  }

  runCommand(command, timeout = 30000) {
    return new Promise((resolve, reject) => {
      exec(command, { timeout }, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout.trim());
      });
    });
  }
}

module.exports = DockerSnapshot;
