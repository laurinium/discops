import { spawn } from 'node:child_process';
import type { RipperConfig } from '@rippy/config';
import type { JobState, TrackMetadata } from '@rippy/shared';
import { AbcdeRunner, type CancelReason } from './abcde.js';
import { BackendClient, driveState } from './client.js';
import { markInterruptedJobs, readTrackExpectation } from './armAudio.js';
import { probeDrive, readLocalDriveInfo, UdevMonitor, type TrayStatus } from './drive.js';

type Logger = { info(o: object): void; warn(o: object): void; error(o: object): void };

type BackendCommand = { startRip?: object; cancelRip?: { reason?: string }; ejectDisc?: object; openTray?: object; closeTray?: object; refreshDisc?: object; resetDrive?: object };

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
  private activeJobId: string | undefined;
  private discId: string | undefined;
  private lastCompletedDiscId: string | undefined;
  private duplicateSuppressed = false;
  private duplicateSuppressionMessage: string | undefined;
  private duplicateEjectAttempts = 0;

  get running(): boolean { return this.abcde.running; }

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
    this.abcde.cancel('CONTAINER_SHUTDOWN');
    this.udev?.stop();
    if (this.poll) clearInterval(this.poll);
    this.client.stop();
  }

  private wireAbcde(): void {
    this.abcde.on('started', ({ jobId, expectedTracks, discId, workDir }: { jobId: string; expectedTracks: number; discId?: string; workDir: string }) => {
      this.activeJobId = jobId;
      this.discId = discId;
      this.duplicateSuppressed = false;
      this.duplicateSuppressionMessage = undefined;
      this.duplicateEjectAttempts = 0;
      this.artist = undefined;
      this.album = undefined;
      this.tracks = [];
      this.setState('reading-metadata', {
        totalTracks: expectedTracks,
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
      this.log.info({ event: 'rip_completed', jobId, expectedTracks, completedTracks, discId: this.discId, device: this.config.DRIVE_DEVICE });
      this.lastCompletedDiscId = this.discId;
      this.duplicateSuppressed = false;
      this.duplicateSuppressionMessage = undefined;
      this.duplicateEjectAttempts = 0;
      this.setState('completed', { progressPercent: 100, totalTracks: expectedTracks });
      this.client.send({ ripEvent: { type: 'RIP_COMPLETED', jobId } });
      this.activeJobId = undefined;
      if (this.config.EJECT_ON_SUCCESS) this.openTrayAfterCompletion();
    });
    this.abcde.on('failed', ({ jobId, error, failureType }: { jobId: string; error: string; failureType?: string }) => {
      this.log.error({ event: 'rip_failed', jobId, failureType, error, device: this.config.DRIVE_DEVICE });
      const message = failureType ? `${failureType}: ${error}` : error;
      this.duplicateSuppressed = false;
      this.duplicateSuppressionMessage = undefined;
      this.duplicateEjectAttempts = 0;
      this.setState(failureTypeToState(failureType), { error: message });
      this.client.send({ ripEvent: { type: 'RIP_FAILED', jobId, error: message } });
      this.activeJobId = undefined;
      if (this.config.EJECT_ON_FAILURE) this.openTrayAfterCompletion();
    });
    this.abcde.on('cancelled', ({ jobId, reason }: { jobId: string; reason: CancelReason }) => {
      const message = `Cancelled: ${reason}`;
      this.duplicateSuppressed = false;
      this.duplicateSuppressionMessage = undefined;
      this.duplicateEjectAttempts = 0;
      this.setState('cancelled', { error: message });
      this.client.send({ ripEvent: { type: 'RIP_CANCELLED', jobId, error: message } });
      this.activeJobId = undefined;
    });
  }

  private async refresh(source: string): Promise<void> {
    const probe = await probeDrive(this.config.DRIVE_DEVICE);
    const status = probe.mediaStatus;
    this.trayStatus = probe.trayStatus;
    this.log.info({ event: 'drive_refresh', source, status, trayStatus: this.trayStatus, device: this.config.DRIVE_DEVICE });
    if (this.abcde.running) {
      // Some drives transiently report NOT READY/absent while cdparanoia owns the
      // device. Treat polling as observational during a rip; only explicit
      // user commands should cancel an active abcde process.
      if (status === 'present') this.mediaPresent = true;
      this.client.send(driveState(this.config.DRIVE_DEVICE, this.state, this.mediaPresent, { trayStatus: this.trayStatus, duplicateSuppressed: this.duplicateSuppressed }));
      return;
    }
    if (this.duplicateSuppressed) {
      if (status === 'present') {
        this.mediaPresent = true;
        this.setState('completed', { progressPercent: 100, error: this.duplicateSuppressionMessage });
        this.reopenTrayForDuplicate();
        return;
      }
      this.mediaPresent = false;
      this.setState('ejected', { progressPercent: 100, currentTrack: 0, currentFile: '', error: this.duplicateSuppressionMessage });
      return;
    }
    if (status === 'present' && !this.mediaPresent) {
      this.mediaPresent = true;
      this.duplicateSuppressed = false;
      const expectation = readTrackExpectation(this.config.DRIVE_DEVICE);
      this.discId = expectation.discId;
      this.setState('disc-detected', { totalTracks: expectation.expectedTracks || undefined });
      this.client.send({ discEvent: { type: 'DISC_INSERTED', device: this.config.DRIVE_DEVICE, ...(expectation.discId ? { discId: expectation.discId } : {}) } });
      if (this.config.AUTO_RIP) {
        if (this.lastCompletedDiscId && expectation.discId && expectation.discId === this.lastCompletedDiscId) {
          this.duplicateSuppressed = true;
          this.duplicateSuppressionMessage = `Duplicate disc detected on ${this.config.DRIVE_DEVICE}; disc ${expectation.discId} was already ripped successfully on this drive. Suppressing auto-rip and ejecting tray.`;
          this.duplicateEjectAttempts = 0;
          this.log.warn({ event: 'auto_rip_suppressed_same_disc', device: this.config.DRIVE_DEVICE, discId: expectation.discId });
          this.client.send({ ripLog: { jobId: this.activeJobId ?? 'duplicate-suppressed', stream: 'system', line: this.duplicateSuppressionMessage } });
          this.setState('completed', { progressPercent: 100, totalTracks: expectation.expectedTracks || undefined, error: this.duplicateSuppressionMessage });
          this.reopenTrayForDuplicate();
          return;
        }
        if (this.lastCompletedDiscId && expectation.discId && expectation.discId !== this.lastCompletedDiscId) this.lastCompletedDiscId = undefined;
        this.duplicateSuppressed = false;
        this.duplicateSuppressionMessage = undefined;
        this.duplicateEjectAttempts = 0;
        this.startRip();
      }
    } else if (status === 'absent' && this.mediaPresent) {
      this.mediaPresent = false;
      this.duplicateSuppressed = false;
      this.duplicateSuppressionMessage = undefined;
      this.duplicateEjectAttempts = 0;
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
      if (this.state !== 'ripping' && this.state !== 'encoding') this.setState('reading-metadata');
      return;
    }

    const track = line.match(/^\s*(\d{1,3}):\s+(.+?)\s*$/);
    if (track?.[1] && track?.[2]) {
      const number = Number(track[1]);
      const title = track[2].trim();
      if (!Number.isNaN(number) && title) {
        const withoutDuplicate = this.tracks.filter((t) => t.number !== number);
        this.tracks = [...withoutDuplicate, { number, title }].sort((a, b) => a.number - b.number);
        this.setState(this.state === 'ripping' || this.state === 'encoding' ? this.state : 'reading-metadata', { totalTracks: this.tracks.length });
      }
    }
  }

  private handleCommand(command: BackendCommand): void {
    if (command.startRip) {
      this.duplicateSuppressed = false;
      this.duplicateSuppressionMessage = undefined;
      this.duplicateEjectAttempts = 0;
      this.startRip(true);
    }
    if (command.cancelRip) this.abcde.cancel('USER_CANCEL');
    if (command.ejectDisc) this.toggleTray();
    if (command.openTray) this.openTray('command-open-tray');
    if (command.closeTray) this.closeTray();
    if (command.refreshDisc) void this.refresh('command');
    if (command.resetDrive) this.resetDrive();
  }

  private startRip(force = false): void {
    if (this.abcde.running) return;
    if (!this.mediaPresent) return;
    if (!force && this.lastCompletedDiscId && this.discId && this.discId === this.lastCompletedDiscId) {
      this.duplicateSuppressed = true;
      this.duplicateSuppressionMessage = `Duplicate disc detected on ${this.config.DRIVE_DEVICE}; disc ${this.discId} was already ripped successfully on this drive. Suppressing auto-rip and ejecting tray.`;
      this.duplicateEjectAttempts = 0;
      this.log.warn({ event: 'start_rip_suppressed_same_disc', device: this.config.DRIVE_DEVICE, discId: this.discId });
      this.client.send({ ripLog: { jobId: this.activeJobId ?? 'duplicate-suppressed', stream: 'system', line: this.duplicateSuppressionMessage } });
      this.setState('completed', { progressPercent: 100, error: this.duplicateSuppressionMessage });
      this.reopenTrayForDuplicate();
      return;
    }
    this.duplicateSuppressed = false;
    this.duplicateSuppressionMessage = undefined;
    this.duplicateEjectAttempts = 0;
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
    if (this.abcde.running) this.abcde.cancel('RESET_REQUEST');
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

  private toggleTray(): void {
    if (this.trayStatus === 'open') this.closeTray();
    else this.openTray('eject');
  }

  private reopenTrayForDuplicate(): void {
    if (this.duplicateEjectAttempts >= 3) return;
    this.duplicateEjectAttempts += 1;
    this.openTray(`duplicate-suppressed-${this.duplicateEjectAttempts}`, true);
  }

  private openTray(source: string, preserveDuplicateStatus = false): void {
    if (this.abcde.running) this.abcde.cancel('EJECT_REQUEST');
    const child = spawn('eject', [this.config.DRIVE_DEVICE], { stdio: 'ignore' });
    child.on('exit', (code) => {
      if (code === 0) {
        this.mediaPresent = false;
        this.trayStatus = 'open';
        if (!preserveDuplicateStatus) {
          this.duplicateSuppressed = false;
          this.duplicateSuppressionMessage = undefined;
          this.duplicateEjectAttempts = 0;
        }
        this.setState('ejected', {
          progressPercent: preserveDuplicateStatus ? 100 : 0,
          currentTrack: 0,
          currentFile: '',
          ...(preserveDuplicateStatus ? { error: this.duplicateSuppressionMessage } : { error: '' }),
        });
      } else if (preserveDuplicateStatus) {
        this.log.warn({ event: 'duplicate_eject_failed', device: this.config.DRIVE_DEVICE, exitCode: code, discId: this.discId, attempt: this.duplicateEjectAttempts });
        this.client.send({ ripLog: { jobId: this.activeJobId ?? 'duplicate-suppressed', stream: 'system', line: `Duplicate disc eject attempt ${this.duplicateEjectAttempts} failed with exit code ${code}; will re-check tray state.` } });
      }
      setTimeout(() => void this.refresh(source), 1500).unref();
    });
  }

  private closeTray(): void {
    const child = spawn('eject', ['-t', this.config.DRIVE_DEVICE], { stdio: 'ignore' });
    child.on('exit', (code) => {
      if (code === 0) {
        this.trayStatus = 'closed';
        this.setState(this.mediaPresent ? this.state : 'idle', { progressPercent: 0, currentTrack: 0, currentFile: '', error: '' });
      }
      setTimeout(() => void this.refresh('close-tray'), 1500).unref();
    });
  }

  private setState(state: JobState, patch: Record<string, unknown> = {}): void {
    this.state = state;
    this.client.send(driveState(this.config.DRIVE_DEVICE, this.state, this.mediaPresent, {
      trayStatus: this.trayStatus,
      jobId: this.activeJobId,
      discId: this.discId,
      duplicateSuppressed: this.duplicateSuppressed,
      artist: this.artist,
      album: this.album,
      tracks: this.tracks,
      ...patch,
    }));
  }
}
