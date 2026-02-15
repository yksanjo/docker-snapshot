#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const DockerSnapshot = require('./lib/docker');
const logger = require('./utils/logger');
const { formatSize, formatDate } = require('./utils/helpers');

const program = new Command();
const docker = new DockerSnapshot();

async function main() {
  program
    .name('docker-snapshot')
    .description('One-click Docker container state save/restore tool')
    .version('1.0.0');

  program
    .command('save')
    .description('Save Docker container state')
    .argument('[name]', 'Snapshot name')
    .action(async (name) => {
      try {
        logger.header('Saving Docker Snapshot');
        const result = await docker.saveSnapshot(name);
        logger.success(`Snapshot saved: ${result.name}`);
      } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    });

  program
    .command('restore')
    .description('Restore Docker containers from snapshot')
    .argument('<name>', 'Snapshot name')
    .action(async (name) => {
      try {
        logger.header('Restoring Docker Snapshot');
        const state = await docker.loadSnapshot(name);
        await docker.restoreContainers(state.containers);
        logger.success('Containers restored!');
      } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    });

  program
    .command('list')
    .description('List saved snapshots')
    .action(async () => {
      try {
        const snapshots = await docker.listSnapshots();
        if (snapshots.length === 0) {
          logger.info('No snapshots found');
          return;
        }
        logger.header('Docker Snapshots');
        console.log(chalk.bold('  Name') + ' '.repeat(40) + chalk.bold('Containers') + ' '.repeat(10) + chalk.bold('Size'));
        console.log(chalk.gray('─'.repeat(80)));
        for (const s of snapshots) {
          console.log(`  ${s.name}${' '.repeat(50 - s.name.length)}${s.containers}${' '.repeat(15)}${formatSize(s.size)}`);
        }
      } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    });

  program
    .command('delete')
    .description('Delete a snapshot')
    .argument('<name>', 'Snapshot name')
    .action(async (name) => {
      try {
        await docker.deleteSnapshot(name);
      } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    });

  if (process.argv.length === 2) {
    program.parse(['node', 'docker-snapshot', '--help']);
  } else {
    program.parse(process.argv);
  }
}

main().catch(error => {
  console.error(chalk.red('Fatal error:'), error.message);
  process.exit(1);
});
