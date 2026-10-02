import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const config = {
  RIPPER_ID: 'drive-01',
  DRIVE_DEVICE: '/dev/sr0',
  SG_DEVICE: '/dev/sg0',
  BACKEND_GRPC_ADDR: 'backend:50051',
  OUTPUT_DIR: '/music',
  WORK_DIR: '/work',
  OUTPUT_FORMAT: 'flac',
  AUTO_RIP: true,
  EJECT_ON_SUCCESS: false,
  EJECT_ON_FAILURE: false,
  UDEV_MONITOR: false,
  POLL_INTERVAL_MS: 5000,
  LOG_LEVEL: 'info',
  ABCDE_CONFIG: '',
} as const;

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

type MockAbcdeInstance = EventEmitter & {
  running: boolean;
  start: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
};

type TestController = {
  refresh(source: string): Promise<void>;
  mediaPresent: boolean;
  discId?: string;
  lastCompletedDiscId?: string;
  startRip(force?: boolean): void;
};

async function loadController() {
  const probeDrive = vi.fn();
  const readTrackExpectation = vi.fn();
  const markInterruptedJobs = vi.fn(() => []);
  const spawn = vi.fn(() => {
    const child = new EventEmitter();
    process.nextTick(() => child.emit('exit', 0));
    return child;
  });
  const abcdeInstances: MockAbcdeInstance[] = [];

  class MockAbcdeRunner extends EventEmitter {
    running = false;
    start = vi.fn(() => 'job');
    cancel = vi.fn();

    constructor() {
      super();
      abcdeInstances.push(this as MockAbcdeInstance);
    }
  }

  class MockBackendClient {
    send = vi.fn();
    start = vi.fn();
    stop = vi.fn();
  }

  class MockUdevMonitor extends EventEmitter {
    start = vi.fn();
    stop = vi.fn();
  }

  vi.doMock('node:child_process', () => ({ spawn }));
  vi.doMock('./abcde.js', () => ({ AbcdeRunner: MockAbcdeRunner }));
  vi.doMock('./client.js', () => ({
    BackendClient: MockBackendClient,
    driveState: (device: string, state: string, mediaPresent: boolean, patch: Record<string, unknown> = {}) => ({
      driveState: { device, state, mediaPresent, ...patch },
    }),
  }));
  vi.doMock('./armAudio.js', () => ({ markInterruptedJobs, readTrackExpectation }));
  vi.doMock('./drive.js', () => ({
    probeDrive,
    readLocalDriveInfo: () => ({}),
    UdevMonitor: MockUdevMonitor,
  }));

  const { RipperController } = await import('./controller.js');
  return { RipperController, probeDrive, readTrackExpectation, abcdeInstances, spawn };
}

describe('RipperController rerip suppression', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('suppresses auto-rip when the same disc reappears after a completed rip', async () => {
    const { RipperController, probeDrive, readTrackExpectation, abcdeInstances, spawn } = await loadController();
    const controller = new RipperController(
      config as ConstructorParameters<typeof RipperController>[0],
      logger as ConstructorParameters<typeof RipperController>[1],
    );
    const testController = controller as unknown as TestController;
    const abcde = abcdeInstances[0]!;

    abcde.emit('started', { jobId: 'job-1', expectedTracks: 10, discId: 'same-disc', workDir: '/work/job-1' });
    abcde.emit('completed', { jobId: 'job-1', expectedTracks: 10, completedTracks: 10 });
    testController.mediaPresent = false;

    probeDrive.mockResolvedValue({ mediaStatus: 'present', trayStatus: 'closed' });
    readTrackExpectation.mockReturnValue({ discId: 'same-disc', expectedTracks: 10 });

    await testController.refresh('test');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(abcde.start).not.toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledWith('eject', ['/dev/sr0'], { stdio: 'ignore' });
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'auto_rip_suppressed_same_disc', discId: 'same-disc' }));
  });

  it('allows auto-rip when a different disc appears after a completed rip', async () => {
    const { RipperController, probeDrive, readTrackExpectation, abcdeInstances } = await loadController();
    const controller = new RipperController(
      config as ConstructorParameters<typeof RipperController>[0],
      logger as ConstructorParameters<typeof RipperController>[1],
    );
    const testController = controller as unknown as TestController;
    const abcde = abcdeInstances[0]!;

    abcde.emit('started', { jobId: 'job-1', expectedTracks: 10, discId: 'disc-a', workDir: '/work/job-1' });
    abcde.emit('completed', { jobId: 'job-1', expectedTracks: 10, completedTracks: 10 });
    testController.mediaPresent = false;

    probeDrive.mockResolvedValue({ mediaStatus: 'present', trayStatus: 'closed' });
    readTrackExpectation.mockReturnValue({ discId: 'disc-b', expectedTracks: 12 });

    await testController.refresh('test');

    expect(abcde.start).toHaveBeenCalledOnce();
  });

  it('still allows an explicit manual start for the same disc', async () => {
    const { RipperController, abcdeInstances } = await loadController();
    const controller = new RipperController(
      config as ConstructorParameters<typeof RipperController>[0],
      logger as ConstructorParameters<typeof RipperController>[1],
    );
    const testController = controller as unknown as TestController;
    const abcde = abcdeInstances[0]!;

    testController.mediaPresent = true;
    testController.discId = 'same-disc';
    testController.lastCompletedDiscId = 'same-disc';

    testController.startRip(true);

    expect(abcde.start).toHaveBeenCalledOnce();
  });
});
