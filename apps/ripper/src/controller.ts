import { spawn } from 'node:child_process';
import type { RipperConfig } from '@rippy/config';
import type { JobState, TrackMetadata } from '@rippy/shared';
import { AbcdeRunner } from './abcde.js';
import { BackendClient, driveState } from './client.js';
import { markInterruptedJobs } from './armAudio.js';
import { probeDrive, readLocalDriveInfo, UdevMonitor, type TrayStatus } from './drive.js';

type Logger = { info(o: object): void; warn(o: object): void; error(o: object): void };

type BackendCommand = { startRip?: object; cancelRip?: { reason?: string }; ejectDisc?: object; refreshDisc?: object; resetDrive?: object };

function failureTypeToState(failureType?: string): JobState {
  if (failureType === 'FAILED_METADATA') return 'failed-metadata';
  if (failureType === 'FAILED_READ') return 'failed-read';
  if (failureType === 'FAILED_ENCODE') return 'failed-encode';
  if (failureType === 'FAILED_VERIFY') return 'failed-verify';
  if (failureType === 'FAILED_FINALIZE') return 'failed-finalize';
  if (failureType === 'FAILED_INTERRUPTED') return 'failed-interrupted';
  return 'failed';
}

export class RipperController {
  private abcde = new AbcdeRunner();
  private client: BackendClient;
  private udev?: UdevMonitor;
  private poll?: NodeJS.Timeout;
  private state: JobState = 'idle';
  private mediaPresent = false;
  private trayStatus: TrayStatus = 'unknown';
  private artist: string | undefined;
  private album: string | undefined;
  private tracks: TrackMetadata[] = [];
  private activeJobId?: string;

  constructor(private config: RipperConfig, private log: Logger) {
    this.client = new BackendClient(config, (cmd) => this.handleCommand(cmd), log, readLocalDriveInfo(config.DRIVE_DEVICE));
    this.wireAbcde();
  }

  start(): void {
    for (const jobId of markInterruptedJobs(this.config.WORK_DIR)) {
      this.log.warn({ event: 'job_marked_interrupted', jobId, device: this.config.DRIVE_DEVICE });
    }
    this.client.start();
    if (this.config.UDEV_MONITOR) {
      this.udev = new UdevMonitor(this.config.DRIVE_DEVICE);
      this.udev.on('change', () => void this.refresh('udev'));
      this.udev.on('error', (err) => this.log.warn({ event: 'udev_monitor_error', err: String(err) }));
      this.udev.start();
    }
    this.poll = setInterval(() => void this.refresh('poll'), this.config.POLL_INTERVAL_MS);
    void this.refresh('startup');
  }

  stop(): void {
    this.abcde.cancel();
    this.udev?.stop();
    if (this.poll) clearInterval(this.poll);
    this.client.stop();
  }

  private wireAbcde(): void {
    this.abcde.on('started', ({ jobId, expectedTracks, discId, workDir }: { jobId: string; expectedTracks: number; discId?: string; workDir: string }) => {
      this.activeJobId = jobId;
      this.artist = undefined;
      this.album = undefined;
      this.tracks = [];
      this.setState('reading-metadata', {
        totalTracks: expectedTracks,
        discId,
        currentTrack: 0,
        progressPercent: 0,
        currentFile: '',
        error: '',
      });
      this.log.info({ event: 'rip_started', jobId, expectedTracks, discId, workDir, device: this.config.DRIVE_DEVICE });
      this.client.send({ ripEvent: { type: 'RIP_STARTED', jobId } });
    });
    this.abcde.on('log', (l: { jobId: string; stream: string; line: string }) => {
      this.parseMetadataLine(l.line);
      this.client.send({ ripLog: l });
    });
    this.abcde.on('progress', (p: Record<string, unknown>) => {
      this.setState('ripping', p);
      this.client.send({ ripEvent: { type: 'RIP_PROGRESS', ...p } });
    });
    this.abcde.on('completed', ({ jobId, expectedTracks, completedTracks }: { jobId: string; expectedTracks: number; completedTracks: number }) => {
      this.log.info({ event: 'rip_completed', jobId, expectedTracks, completedTracks, device: this.config.DRIVE_DEVICE });
      this.setState('completed', { progressPercent: 100, totalTracks: expectedTracks });
      this.client.send({ ripEvent: { type: 'RIP_COMPLETED', jobId } });
      if (this.config.EJECT_ON_SUCCESS) this.openTrayAfterCompletion();
    });
    this.abcde.on('failed', ({ jobId, error, failureType }: { jobId: string; error: string; failureType?: string }) => {
      this.log.error({ event: 'rip_failed', jobId, failureType, error, device: this.config.DRIVE_DEVICE });
      const message = failureType ? `${failureType}: ${error}` : error;
      this.setState(failureTypeToState(failureType), { error: message });
      this.client.send({ ripEvent: { type: 'RIP_FAILED', jobId, error: message } });
      if (this.config.EJECT_ON_FAILURE) this.openTrayAfterCompletion();
    });
    this.abcde.on('cancelled', ({ jobId }: { jobId: string }) => { this.setState('cancelled'); this.client.send({ ripEvent: { type: 'RIP_CANCELLED', jobId } }); });
  }

  private async refresh(source: string): Promise<void> {
    const probe = await probeDrive(this.config.DRIVE_DEVICE);
    const status = probe.mediaStatus;
    this.trayStatus = probe.trayStatus;
    this.log.info({ event: 'drive_refresh', source, status, trayStatus: this.trayStatus, device: this.config.DRIVE_DEVICE });
    if (status === 'present' && !this.mediaPresent) {
      this.mediaPresent = true;
      this.setState('disc-detected');
      this.client.send({ discEvent: { type: 'DISC_INSERTED', device: this.config.DRIVE_DEVICE } });
      if (this.config.AUTO_RIP) this.startRip();
    } else if (status === 'absent' && this.mediaPresent) {
      this.mediaPresent = false;
      if (this.abcde.running) this.abcde.cancel();
      this.setState('ejected');
      this.client.send({ discEvent: { type: 'DISC_REMOVED', device: this.config.DRIVE_DEVICE } });
    } else {
      this.client.send(driveState(this.config.DRIVE_DEVICE, this.state, this.mediaPresent, { trayStatus: this.trayStatus }));
    }
  }

  private parseMetadataLine(line: string): void {
    const selected = line.match(/Selected:\s+#\d+\s+\((.+?)\s+\/\s+(.+?)\)\s*$/i);
    const candidate = line.match(/^#\d+\s+\([^)]+\):\s+----\s+(.+?)\s+\/\s+(.+?)\s+----\s*$/);
    const metadata = selected ?? candidate;
    if (metadata?.[1] && metadata?.[2]) {
      this.artist = metadata[1].trim();
      this.album = metadata[2].trim();
      this.setState('reading-metadata');
      return;
    }

    const track = line.match(/^\s*(\d{1,3}):\s+(.+?)\s*$/);
    if (track?.[1] && track?.[2]) {
      const number = Number(track[1]);
      const title = track[2].trim();
      if (!Number.isNaN(number) && title) {
        const withoutDuplicate = this.tracks.filter((t) => t.number !== number);
        this.tracks = [...withoutDuplicate, { number, title }].sort((a, b) => a.number - b.number);
        this.setState('reading-metadata', { totalTracks: this.tracks.length });
      }
    }
  }

  private handleCommand(command: BackendCommand): void {
    if (command.startRip) this.startRip();
    if (command.cancelRip) this.abcde.cancel();
    if (command.ejectDisc) this.eject();
    if (command.refreshDisc) void this.refresh('command');
    if (command.resetDrive) this.resetDrive();
  }

  private startRip(): void {
    if (this.abcde.running) return;
    if (!this.mediaPresent) return;
    this.abcde.start({
      device: this.config.DRIVE_DEVICE,
      outputDir: this.config.OUTPUT_DIR,
      workDir: this.config.WORK_DIR,
      outputFormat: this.config.OUTPUT_FORMAT,
    });
  }

  private openTrayAfterCompletion(): void {
    const child = spawn('eject', [this.config.DRIVE_DEVICE], { stdio: 'ignore' });
    child.on('exit', (code) => {
      if (code === 0) {
        this.mediaPresent = false;
        this.trayStatus = 'open';
        this.setState('completed', { progressPercent: 100 });
      }
      setTimeout(() => void this.refresh('completed-eject'), 1500).unref();
    });
  }

  private resetDrive(): void {
    if (this.abcde.running) this.abcde.cancel();
    const target = this.config.SG_DEVICE ?? this.config.DRIVE_DEVICE;
    this.log.warn({ event: 'drive_reset_requested', device: this.config.DRIVE_DEVICE, resetDevice: target });
    this.client.send({ ripLog: { jobId: this.activeJobId ?? 'drive-reset', stream: 'system', line: `Resetting optical drive via sg_reset --device ${target}` } });
    const child = spawn('sg_reset', ['--device', target], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.client.send({ ripLog: { jobId: this.activeJobId ?? 'drive-reset', stream: 'system', line: chunk.trim() } }));
    child.stderr.on('data', (chunk: string) => this.client.send({ ripLog: { jobId: this.activeJobId ?? 'drive-reset', stream: 'system', line: chunk.trim() } }));
    child.on('exit', (code) => {
      this.log.warn({ event: 'drive_reset_finished', device: this.config.DRIVE_DEVICE, resetDevice: target, exitCode: code });
      this.client.send({ ripLog: { jobId: this.activeJobId ?? 'drive-reset', stream: 'system', line: `Drive reset finished with exit code ${code}` } });
      setTimeout(() => void this.refresh('drive-reset'), 2500).unref();
    });
  }

  private eject(): void {
    if (this.abcde.running) this.abcde.cancel();
    const closing = this.trayStatus === 'open';
    const args = closing ? ['-t', this.config.DRIVE_DEVICE] : [this.config.DRIVE_DEVICE];
    const child = spawn('eject', args, { stdio: 'ignore' });
    child.on('exit', (code) => {
      if (code === 0) {
        if (closing) {
          this.trayStatus = 'closed';
          this.setState(this.mediaPresent ? this.state : 'idle');
        } else {
          this.mediaPresent = false;
          this.trayStatus = 'open';
          this.setState('ejected');
        }
      }
      setTimeout(() => void this.refresh(closing ? 'close-tray' : 'eject'), 1500).unref();
    });
  }

  private setState(state: JobState, patch: Record<string, unknown> = {}): void {
    this.state = state;
    this.client.send(driveState(this.config.DRIVE_DEVICE, this.state, this.mediaPresent, {
      trayStatus: this.trayStatus,
      jobId: this.activeJobId,
      artist: this.artist,
      album: this.album,
      tracks: this.tracks,
      ...patch,
    }));
  }
}
