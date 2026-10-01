import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createWriteStream, existsSync, rmSync, writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import type { Writable } from 'node:stream';
import {
  applyMusicBrainzDiscMetadata,
  atomicPublish,
  createJobPaths,
  prepareFreshJob,
  readTrackExpectation,
  validateCompletedRip,
  writeArmAbcdeConfig,
  type ArmFailureType,
  type JobPaths,
} from './armAudio.js';
import { lookupMusicBrainzDisc, type MusicBrainzDiscMetadata } from './musicbrainz.js';

export interface AbcdeOptions { device: string; outputDir: string; workDir: string; outputFormat: string; }
export interface Progress { currentTrack?: number; totalTracks?: number; progressPercent?: number; currentFile?: string; phase?: string; }
export interface RipFailure { jobId: string; error: string; failureType: ArmFailureType; exitCode?: number | null; signal?: NodeJS.Signals | null; }

export class AbcdeRunner extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | undefined;
  private childPid: number | undefined;
  private starting = false;
  private cancelled = false;
  private currentJobId: string | undefined;
  private currentPaths: JobPaths | undefined;
  get running(): boolean { return this.starting || this.child !== undefined; }

  start(opts: AbcdeOptions): string {
    if (this.running) throw new Error('abcde already running');
    this.cancelled = false;
    this.starting = true;
    const jobId = crypto.randomUUID();
    const paths = createJobPaths(opts.workDir, jobId);
    prepareFreshJob(paths);
    writeArmAbcdeConfig(paths, opts.outputFormat);
    writeFileSync(`${paths.workDir}/RUNNING`, new Date().toISOString());
    const expectation = readTrackExpectation(opts.device);
    let musicBrainz: MusicBrainzDiscMetadata | undefined;
    let expectedTracks = expectation.expectedTracks;
    let nextLineContainsTrackList = false;
    const writeJobMetadata = (): void => writeFileSync(`${paths.workDir}/job.json`, JSON.stringify({
      jobId,
      device: opts.device,
      discId: expectation.discId,
      musicBrainz,
      expectedTracks,
      startedAt: new Date().toISOString(),
    }, null, 2));
    writeJobMetadata();
    this.currentJobId = jobId;
    this.currentPaths = paths;
    this.emit('started', { jobId, expectedTracks, discId: expectation.discId, workDir: paths.workDir });

    void (async () => {
      try {
        musicBrainz = await lookupMusicBrainzDisc(opts.device).catch(() => undefined);
        if (musicBrainz?.expectedTracks) expectedTracks = musicBrainz.expectedTracks;
        writeJobMetadata();
        const args = ['-N', '-V', '-d', opts.device, '-c', paths.abcdeConfig];
        if (musicBrainz?.discNumber) args.push('-W', musicBrainz.totalDiscs ? `${musicBrainz.discNumber},${musicBrainz.totalDiscs}` : String(musicBrainz.discNumber));
        if (musicBrainz?.discNumber) this.emit('progress', {
          jobId,
          totalTracks: expectedTracks,
          phase: `DISC_${musicBrainz.discNumber}${musicBrainz.totalDiscs ? `_OF_${musicBrainz.totalDiscs}` : ''}`,
          artist: musicBrainz.artist,
          album: musicBrainz.album,
          releaseDate: musicBrainz.releaseDate,
          musicBrainzDiscId: musicBrainz.musicBrainzDiscId,
          musicBrainzReleaseId: musicBrainz.releaseId,
          discNumber: musicBrainz.discNumber,
          totalDiscs: musicBrainz.totalDiscs,
        });

        this.emit('log', { jobId, stream: 'stdout', line: `Starting abcde ${args.map((arg) => JSON.stringify(arg)).join(' ')}` });
        const env = { ...process.env, TERM: process.env.TERM ?? 'dumb' };
        const child = spawn('abcde', args, { env, cwd: paths.workDir, shell: false, detached: true });
        this.child = child;
        this.childPid = child.pid;
        this.starting = false;
        const stdoutLog = createWriteStream(paths.stdoutLog, { flags: 'a' });
        const stderrLog = createWriteStream(paths.stderrLog, { flags: 'a' });

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
        child.stdout.on('data', (d: Buffer) => onLine('stdout', stdoutLog, d));
        child.stderr.on('data', (d: Buffer) => onLine('stderr', stderrLog, d));
        child.on('error', (err) => this.fail(jobId, paths, 'UNKNOWN_ERROR', err.message));
        child.on('exit', (code, signal) => {
          stdoutLog.end();
          stderrLog.end();
          this.child = undefined;
          this.childPid = undefined;
          this.starting = false;
          if (this.cancelled) {
            this.markTerminal(paths, 'CANCELLED');
            this.emit('cancelled', { jobId });
            return;
          }
          try {
            if (code === 0) applyMusicBrainzDiscMetadata(paths);
          } catch (err) {
            this.fail(jobId, paths, 'FAILED_METADATA', err instanceof Error ? err.message : String(err), code, signal);
            return;
          }
          if (code === null && signal) {
            this.fail(jobId, paths, 'FAILED_INTERRUPTED', `abcde terminated by signal ${signal}`, code, signal);
            return;
          }
          const validation = validateCompletedRip(paths, expectedTracks, code);
          if (!validation.ok) {
            this.fail(jobId, paths, validation.failureType ?? 'UNKNOWN_ERROR', validation.error ?? `abcde exited code=${code} signal=${signal ?? ''}`, code, signal);
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
      } catch (err) {
        this.starting = false;
        this.fail(jobId, paths, 'UNKNOWN_ERROR', err instanceof Error ? err.message : String(err));
      }
    })();

    return jobId;
  }

  cancel(): void {
    this.cancelled = true;
    if (!this.child) return;
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
    this.starting = false;
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
