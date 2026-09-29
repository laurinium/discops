import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createWriteStream, existsSync, rmSync, writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import type { Writable } from 'node:stream';
import {
  atomicPublish,
  createJobPaths,
  prepareFreshJob,
  readTrackExpectation,
  validateCompletedRip,
  writeArmAbcdeConfig,
  type ArmFailureType,
  type JobPaths,
} from './armAudio.js';

export interface AbcdeOptions { device: string; outputDir: string; workDir: string; outputFormat: string; }
export interface Progress { currentTrack?: number; totalTracks?: number; progressPercent?: number; currentFile?: string; phase?: string; }

export interface RipFailure { jobId: string; error: string; failureType: ArmFailureType; exitCode?: number | null; signal?: NodeJS.Signals | null; }

export class AbcdeRunner extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | undefined;
  private childPid: number | undefined;
  private cancelled = false;
  private currentJobId: string | undefined;
  private currentPaths: JobPaths | undefined;
  get running(): boolean { return this.child !== undefined; }

  start(opts: AbcdeOptions): string {
    if (this.child) throw new Error('abcde already running');
    this.cancelled = false;
    const jobId = crypto.randomUUID();
    const paths = createJobPaths(opts.workDir, jobId);
    prepareFreshJob(paths);
    writeArmAbcdeConfig(paths, opts.outputFormat);
    writeFileSync(`${paths.workDir}/RUNNING`, new Date().toISOString());
    const expectation = readTrackExpectation(opts.device);
    let expectedTracks = expectation.expectedTracks;
    let nextLineContainsTrackList = false;
    const writeJobMetadata = (): void => writeFileSync(`${paths.workDir}/job.json`, JSON.stringify({ jobId, device: opts.device, discId: expectation.discId, expectedTracks, startedAt: new Date().toISOString() }, null, 2));
    writeJobMetadata();

    const args = ['-N', '-V', '-d', opts.device, '-c', paths.abcdeConfig];
    const env = { ...process.env, TERM: process.env.TERM ?? 'dumb' };
    this.child = spawn('abcde', args, { env, cwd: paths.workDir, shell: false, detached: true });
    this.childPid = this.child.pid;
    this.currentJobId = jobId;
    this.currentPaths = paths;
    const stdoutLog = createWriteStream(paths.stdoutLog, { flags: 'a' });
    const stderrLog = createWriteStream(paths.stderrLog, { flags: 'a' });
    this.emit('started', { jobId, expectedTracks: expectation.expectedTracks, discId: expectation.discId, workDir: paths.workDir });

    const onLine = (stream: 'stdout' | 'stderr', log: Writable, data: Buffer) => {
      log.write(data);
      for (const line of data.toString('utf8').split(/\r?\n/).filter(Boolean)) {
        this.emit('log', { jobId, stream, line });
        if (nextLineContainsTrackList) {
          const parsedExpectedTracks = parseAbcdeTrackListCount(line);
          if (parsedExpectedTracks > 0) {
            expectedTracks = parsedExpectedTracks;
            writeJobMetadata();
            this.emit('progress', { jobId, totalTracks: expectedTracks, phase: 'METADATA_LOOKUP' });
          }
          nextLineContainsTrackList = false;
        }
        if (/Grabbing entire CD - tracks:/i.test(line)) nextLineContainsTrackList = true;
        const progress = parseProgress(line);
        if (progress) {
          if (progress.totalTracks) expectedTracks = progress.totalTracks;
          this.emit('progress', { jobId, ...progress });
        }
      }
    };
    this.child.stdout.on('data', (d: Buffer) => onLine('stdout', stdoutLog, d));
    this.child.stderr.on('data', (d: Buffer) => onLine('stderr', stderrLog, d));
    this.child.on('error', (err) => this.fail(jobId, paths, 'UNKNOWN_ERROR', err.message));
    this.child.on('exit', (code, signal) => {
      stdoutLog.end();
      stderrLog.end();
      this.child = undefined;
      this.childPid = undefined;
      if (this.cancelled) {
        this.markTerminal(paths, 'CANCELLED');
        this.emit('cancelled', { jobId });
        return;
      }
      const validation = validateCompletedRip(paths, expectedTracks, code);
      if (!validation.ok) {
        const processError = code === null && signal
          ? `abcde terminated by signal ${signal}`
          : validation.error;
        this.fail(jobId, paths, validation.failureType ?? 'UNKNOWN_ERROR', processError ?? `abcde exited code=${code} signal=${signal ?? ''}`, code, signal);
        return;
      }
      try {
        this.emit('progress', { jobId, phase: 'FINALIZING', progressPercent: 99 });
        atomicPublish(paths, opts.outputDir);
        this.markTerminal(paths, 'COMPLETED');
        rmSync(paths.wavDir, { recursive: true, force: true });
        this.emit('completed', { jobId, expectedTracks: validation.expectedTracks, completedTracks: validation.completedTracks });
      } catch (err) {
        this.fail(jobId, paths, 'FAILED_FINALIZE', err instanceof Error ? err.message : String(err), code, signal);
      }
    });
    return jobId;
  }

  cancel(): void {
    if (!this.child) return;
    this.cancelled = true;
    this.terminateProcessGroup('SIGTERM');
    setTimeout(() => this.terminateProcessGroup('SIGKILL'), 10_000).unref();
  }

  private terminateProcessGroup(signal: NodeJS.Signals): void {
    if (!this.childPid) return;
    try { process.kill(-this.childPid, signal); } catch { this.child?.kill(signal); }
  }

  private fail(jobId: string, paths: JobPaths, failureType: ArmFailureType, error: string, exitCode?: number | null, signal?: NodeJS.Signals | null): void {
    this.child = undefined;
    this.childPid = undefined;
    this.markTerminal(paths, 'FAILED');
    this.emit('failed', { jobId, error, failureType, ...(exitCode !== undefined ? { exitCode } : {}), ...(signal !== undefined ? { signal } : {}) } satisfies RipFailure);
  }

  private markTerminal(paths: JobPaths, marker: 'COMPLETED' | 'FAILED' | 'CANCELLED'): void {
    if (existsSync(`${paths.workDir}/RUNNING`)) rmSync(`${paths.workDir}/RUNNING`, { force: true });
    writeFileSync(`${paths.workDir}/${marker}`, new Date().toISOString());
  }
}

export function parseAbcdeTrackListCount(line: string): number {
  const matches = line.match(/\b\d{2,3}\b/g) ?? [];
  return matches.length;
}

export function parseProgress(line: string): Progress | undefined {
  const track = line.match(/track\s+(\d+)\s+of\s+(\d+)/i) ?? line.match(/Track\s+(\d+)\/(\d+)/i) ?? line.match(/Grabbing track\s+(\d+)/i);
  const pct = line.match(/(\d{1,3}(?:\.\d+)?)%/);
  const file = line.match(/(?:outputting to|output|encoding|ripping).*?([^/\s]+\.(?:flac|mp3|ogg|m4a|wav))/i);
  const phase = /encoding/i.test(line) ? 'ENCODING' : /tagging/i.test(line) ? 'TAGGING' : /grabbing|ripping|outputting/i.test(line) ? 'RIPPING' : undefined;
  if (!track && !pct && !file && !phase) return undefined;
  const progress: Progress = {};
  if (track?.[1]) progress.currentTrack = Number(track[1]);
  if (track?.[2]) progress.totalTracks = Number(track[2]);
  if (pct?.[1]) progress.progressPercent = Math.min(100, Number(pct[1]));
  if (file?.[1]) progress.currentFile = file[1];
  if (phase) progress.phase = phase;
  return progress;
}
