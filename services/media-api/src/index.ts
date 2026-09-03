import { mkdir } from 'node:fs/promises';
import { createApp } from './app';
import { loadConfig } from './config';
import { PostgresMediaRepository } from './repository';
import { EncryptedStorage } from './storage';
import { MediaWorker } from './worker';

const config = loadConfig();
await mkdir(config.storagePath, { recursive: true });
const repository = new PostgresMediaRepository(config.databaseUrl);
const storage = new EncryptedStorage(config.storagePath, config.storageKey);
const worker = new MediaWorker(repository, storage, config);
const app = createApp(repository, storage, config).listen(config.port);
worker.start();

const shutdown = async () => {
  worker.stop();
  app.stop();
  await repository.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
console.log(`WPPConnect Media API listening on :${config.port}`);
