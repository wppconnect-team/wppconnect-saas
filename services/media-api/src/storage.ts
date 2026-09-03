import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export class EncryptedStorage {
  constructor(private root: string, private key: Buffer) {}

  path(jobId: string, name: 'input' | 'output'): string {
    return join(this.root, jobId.slice(0, 2), jobId, `${name}.enc`);
  }

  async put(path: string, plain: Uint8Array): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.concat([Buffer.from('WPPM1'), iv, cipher.getAuthTag(), encrypted]));
  }

  async get(path: string): Promise<Buffer> {
    const value = await readFile(path);
    if (value.subarray(0, 5).toString() !== 'WPPM1') throw new Error('Invalid encrypted media envelope');
    const decipher = createDecipheriv('aes-256-gcm', this.key, value.subarray(5, 17));
    decipher.setAuthTag(value.subarray(17, 33));
    return Buffer.concat([decipher.update(value.subarray(33)), decipher.final()]);
  }

  async removeJob(jobId: string): Promise<void> {
    await rm(join(this.root, jobId.slice(0, 2), jobId), { recursive: true, force: true });
  }
}
