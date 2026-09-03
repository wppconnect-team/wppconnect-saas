import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type Probe = { durationSeconds: number; codec: string; format: string };

async function command(binary: string, args: string[]): Promise<string> {
  const process = Bun.spawn([binary, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [code, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`${binary} failed: ${stderr.slice(0, 1000)}`);
  return stdout;
}

export async function probeFile(path: string): Promise<Probe> {
  const raw = await command('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,format_name',
    '-show_entries', 'stream=codec_name', '-select_streams', 'a:0', '-of', 'json', path]);
  const parsed = JSON.parse(raw) as { format?: { duration?: string; format_name?: string }; streams?: Array<{ codec_name?: string }> };
  const durationSeconds = Number(parsed.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Audio duration could not be determined');
  return { durationSeconds, codec: parsed.streams?.[0]?.codec_name ?? '', format: parsed.format?.format_name ?? '' };
}

export async function withPlainInput<T>(input: Uint8Array, filename: string, fn: (path: string, dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'wpp-media-'));
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'input.bin';
  const path = join(dir, safe);
  try {
    await writeFile(path, input);
    return await fn(path, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function convertToPtt(input: Uint8Array, filename: string, maxDuration: number) {
  return withPlainInput(input, filename, async (inputPath, dir) => {
    const original = await probeFile(inputPath);
    if (original.durationSeconds > maxDuration) throw new Error('Audio exceeds the configured duration limit');
    const outputPath = join(dir, 'output.ogg');
    await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
      '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip', outputPath]);
    const probe = await probeFile(outputPath);
    if (probe.codec !== 'opus' || !probe.format.includes('ogg')) throw new Error('Converted output is not OGG/Opus');
    return { bytes: await readFile(outputPath), probe };
  });
}

export async function transcribeAudio(
  input: Uint8Array,
  filename: string,
  options: { baseUrl: string; apiKey: string; model: string; language?: string }
) {
  if (!options.apiKey) throw Object.assign(new Error('Transcription provider is not configured'), { code: 'provider_unavailable' });
  const form = new FormData();
  const body = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
  form.set('file', new Blob([body]), filename);
  form.set('model', options.model);
  form.set('response_format', 'verbose_json');
  if (options.language) form.set('language', options.language);
  const response = await fetch(`${options.baseUrl}/audio/transcriptions`, {
    method: 'POST', headers: { authorization: `Bearer ${options.apiKey}` }, body: form,
  });
  if (!response.ok) throw Object.assign(new Error(`Transcription provider returned ${response.status}`), { code: 'provider_error' });
  const value = await response.json() as Record<string, unknown>;
  return {
    text: value.text ?? '', language: value.language ?? options.language ?? null,
    duration: value.duration ?? null, segments: value.segments ?? [],
  };
}
