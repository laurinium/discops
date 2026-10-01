import os from 'node:os';
import { credentials, type ClientDuplexStream } from '@grpc/grpc-js';
import { loadProto } from '@rippy/proto';
import type { RipperConfig } from '@rippy/config';
import type { DriveInfo, JobState } from '@rippy/shared';

type BackendCommand = {
  commandId?: string;
  startRip?: object;
  cancelRip?: { reason?: string };
  ejectDisc?: object;
  openTray?: object;
  closeTray?: object;
  refreshDisc?: object;
  resetDrive?: object;
};
type RipperEvent = Record<string, unknown>;
type CommandHandler = (command: BackendCommand) => void;

type ServiceCtor = new (addr: string, creds: ReturnType<typeof credentials.createInsecure>) => {
  connect(): ClientDuplexStream<RipperEvent, BackendCommand>;
};

function serviceCtor(): ServiceCtor {
  const loaded = loadProto() as Record<string, unknown>;
  return (((loaded.rippy as Record<string, unknown>).v1 as Record<string, unknown>).RipperService) as ServiceCtor;
}

export class BackendClient {
  private stream: ClientDuplexStream<RipperEvent, BackendCommand> | undefined;
  private connected = false;
  private queue: RipperEvent[] = [];
  private reconnectTimer: NodeJS.Timeout | undefined;
  private heartbeat: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(
    private config: RipperConfig,
    private onCommand: CommandHandler,
    private log: { info(o: object): void; warn(o: object): void; error(o: object): void },
    private driveInfo: DriveInfo = {},
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.stream?.end();
  }

  send(event: Omit<RipperEvent, 'ripperId' | 'timestampUnixMs'>): void {
    const message = { ripperId: this.config.RIPPER_ID, timestampUnixMs: Date.now(), ...event };
    if (!this.connected || !this.stream) {
      this.queue.push(message);
      this.queue = this.queue.slice(-500);
      return;
    }
    this.stream.write(message);
  }

  private connect(): void {
    if (this.stopped) return;
    const Client = serviceCtor();
    const client = new Client(this.config.BACKEND_GRPC_ADDR, credentials.createInsecure());
    this.stream = client.connect();
    this.connected = true;
    this.log.info({ event: 'backend_stream_connected', backend: this.config.BACKEND_GRPC_ADDR });
    this.stream.on('data', (cmd) => this.onCommand(cmd));
    this.stream.on('error', (err) => this.handleDisconnect(err));
    this.stream.on('end', () => this.handleDisconnect());
    this.stream.on('close', () => this.handleDisconnect());
    this.send({ hello: {
      device: this.config.DRIVE_DEVICE,
      hostname: os.hostname(),
      autoRip: this.config.AUTO_RIP,
      outputFormat: this.config.OUTPUT_FORMAT,
      outputDir: this.config.OUTPUT_DIR,
      sgDevice: this.config.SG_DEVICE,
      driveVendor: this.driveInfo.vendor,
      driveModel: this.driveInfo.model,
      driveRevision: this.driveInfo.revision,
      driveSerial: this.driveInfo.serial,
      canOpenTray: this.driveInfo.canOpenTray,
      canCloseTray: this.driveInfo.canCloseTray,
      canLockTray: this.driveInfo.canLockTray,
      canReadDvd: this.driveInfo.canReadDvd,
      canWriteCdr: this.driveInfo.canWriteCdr,
    } });
    for (const queued of this.queue.splice(0)) this.stream.write(queued);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => this.send({ heartbeat: { status: 'ok' } }), 10_000);
  }

  private handleDisconnect(err?: Error): void {
    if (!this.connected && !err) return;
    this.connected = false;
    if (err) this.log.warn({ event: 'backend_stream_error', err: err.message });
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (!this.stopped && !this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = undefined;
        this.connect();
      }, 3000);
    }
  }
}

export function driveState(device: string, state: JobState, mediaPresent: boolean, patch: Record<string, unknown> = {}): RipperEvent {
  return { driveState: { device, state, mediaPresent, ...patch } };
}
