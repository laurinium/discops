import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

export interface AbcdeOptions { device: string; outputDir: string; configPath?: string; outputFormat: string; }
export interface Progress { currentTrack?: number; totalTracks?: number; progressPercent?: number; currentFile?: string; }

export class AbcdeRunner extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | undefined;
  private cancelled = false;
  get running(): boolean { return this.child !== undefined; }

  start(opts: AbcdeOptions): string {
    if (this.child) throw new Error('abcde already running');
    this.cancelled = false;
    const jobId = crypto.randomUUID();
    const removedResumeDir = removeAbcdeResumeDir(opts.device, opts.outputDir);
    const args = ['-N', '-V', '-d', opts.device, '-o', opts.outputFormat];
    if (opts.configPath) args.push('-c', opts.configPath);
    const env = { ...process.env, TERM: process.env.TERM ?? 'dumb', OUTPUTDIR: opts.outputDir };
    this.child = spawn('abcde', args, { env, cwd: opts.outputDir, shell: false });
    this.emit('started', jobId);
    if (removedResumeDir) this.emit('log', { jobId, stream: 'stdout', line: `Removed stale abcde resume directory: ${removedResumeDir}` });
    const onLine = (stream: 'stdout' | 'stderr', data: Buffer) => {
      for (const line of data.toString('utf8').split(/\r?\n/).filter(Boolean)) {
        this.emit('log', { jobId, stream, line });
        const progress = parseProgress(line);
        if (progress) this.emit('progress', { jobId, ...progress });
      }
    };
    this.child.stdout.on('data', (d: Buffer) => onLine('stdout', d));
    this.child.stderr.on('data', (d: Buffer) => onLine('stderr', d));
    this.child.on('error', (err) => { this.child = undefined; this.emit('failed', { jobId, error: err.message }); });
    this.child.on('exit', (code, signal) => {
      this.child = undefined;
      if (this.cancelled) this.emit('cancelled', { jobId });
      else if (code === 0) this.emit('completed', { jobId });
      else this.emit('failed', { jobId, error: `abcde exited code=${code} signal=${signal ?? ''}` });
    });
    return jobId;
  }

  cancel(): void {
    if (!this.child) return;
    this.cancelled = true;
    this.child.kill('SIGTERM');
    setTimeout(() => this.child?.kill('SIGKILL'), 10_000).unref();
  }
}

function removeAbcdeResumeDir(device: string, outputDir: string): string | undefined {
  const discId = readDiscId(device);
  if (!discId) return undefined;
  const resumeDir = path.join(outputDir, `abcde.${discId}`);
  if (!existsSync(resumeDir)) return undefined;
  rmSync(resumeDir, { recursive: true, force: true });
  return resumeDir;
}

function readDiscId(device: string): string | undefined {
  const result = spawnSync('cd-discid', ['-q', '-d', device, 'discid'], { encoding: 'utf8' });
  if (result.status !== 0) return undefined;
  const discId = result.stdout.trim().split(/\s+/)[0];
  return discId && /^[a-fA-F0-9]+$/.test(discId) ? discId.toLowerCase() : undefined;
}

export function parseProgress(line: string): Progress | undefined {
  const track = line.match(/track\s+(\d+)\s+of\s+(\d+)/i) ?? line.match(/Track\s+(\d+)\/(\d+)/i) ?? line.match(/Grabbing track\s+(\d+)/i);
  const pct = line.match(/(\d{1,3}(?:\.\d+)?)%/);
  const file = line.match(/(?:output|encoding|ripping).*?([^/\s]+\.(?:flac|mp3|ogg|m4a|wav))/i);
  if (!track && !pct && !file) return undefined;
  const progress: Progress = {};
  if (track?.[1]) progress.currentTrack = Number(track[1]);
  if (track?.[2]) progress.totalTracks = Number(track[2]);
  if (pct?.[1]) progress.progressPercent = Math.min(100, Number(pct[1]));
  if (file?.[1]) progress.currentFile = file[1];
  return progress;
}
