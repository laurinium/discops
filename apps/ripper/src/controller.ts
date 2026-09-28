import { spawn } from 'node:child_process';
import type { RipperConfig } from '@rippy/config';
import type { JobState } from '@rippy/shared';
import { AbcdeRunner } from './abcde.js';
import { BackendClient, driveState } from './client.js';
import { probeDrive, UdevMonitor, type TrayStatus } from './drive.js';

type Logger = { info(o: object): void; warn(o: object): void; error(o: object): void };

type BackendCommand = { startRip?: object; cancelRip?: { reason?: string }; ejectDisc?: object; refreshDisc?: object };

export class RipperController {
  private abcde = new AbcdeRunner();
  private client: BackendClient;
  private udev?: UdevMonitor;
  private poll?: NodeJS.Timeout;
  private state: JobState = 'idle';
  private mediaPresent = false;
  private trayStatus: TrayStatus = 'unknown';
  private activeJobId?: string;

  constructor(private config: RipperConfig, private log: Logger) {
    this.client = new BackendClient(config, (cmd) => this.handleCommand(cmd), log);
    this.wireAbcde();
  }

  start(): void {
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
    this.abcde.on('started', (jobId: string) => {
      this.activeJobId = jobId;
      this.setState('ripping');
      this.client.send({ ripEvent: { type: 'RIP_STARTED', jobId } });
    });
    this.abcde.on('log', (l: { jobId: string; stream: string; line: string }) => this.client.send({ ripLog: l }));
    this.abcde.on('progress', (p: Record<string, unknown>) => this.client.send({ ripEvent: { type: 'RIP_PROGRESS', ...p } }));
    this.abcde.on('completed', ({ jobId }: { jobId: string }) => { this.setState('completed', { progressPercent: 100 }); this.client.send({ ripEvent: { type: 'RIP_COMPLETED', jobId } }); });
    this.abcde.on('failed', ({ jobId, error }: { jobId: string; error: string }) => { this.setState('failed', { error }); this.client.send({ ripEvent: { type: 'RIP_FAILED', jobId, error } }); });
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

  private handleCommand(command: BackendCommand): void {
    if (command.startRip) this.startRip();
    if (command.cancelRip) this.abcde.cancel();
    if (command.ejectDisc) this.eject();
    if (command.refreshDisc) void this.refresh('command');
  }

  private startRip(): void {
    if (this.abcde.running) return;
    if (!this.mediaPresent) return;
    this.abcde.start({
      device: this.config.DRIVE_DEVICE,
      outputDir: this.config.OUTPUT_DIR,
      ...(this.config.ABCDE_CONFIG ? { configPath: this.config.ABCDE_CONFIG } : {}),
      outputFormat: this.config.OUTPUT_FORMAT,
    });
  }

  private eject(): void {
    if (this.abcde.running) this.abcde.cancel();
    const child = spawn('eject', [this.config.DRIVE_DEVICE], { stdio: 'ignore' });
    child.on('exit', (code) => {
      if (code === 0) {
        this.mediaPresent = false;
        this.trayStatus = 'open';
        this.setState('ejected');
      }
      setTimeout(() => void this.refresh('eject'), 1500).unref();
    });
  }

  private setState(state: JobState, patch: Record<string, unknown> = {}): void {
    this.state = state;
    this.client.send(driveState(this.config.DRIVE_DEVICE, this.state, this.mediaPresent, { trayStatus: this.trayStatus, ...patch }));
  }
}
