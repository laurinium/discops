import { z } from 'zod';

const boolish = z
  .string()
  .optional()
  .transform((v) => v === undefined || ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));

export const BackendEnv = z.object({
  BACKEND_HTTP_PORT: z.coerce.number().default(8080),
  BACKEND_GRPC_PORT: z.coerce.number().default(50051),
  DATABASE_PATH: z.string().default('/data/rippy.db'),
  CORS_ORIGIN: z.string().default('*'),
});

export const RipperEnv = z.object({
  RIPPER_ID: z.string().min(1),
  DRIVE_DEVICE: z.string().min(1).default('/dev/sr0'),
  SG_DEVICE: z.string().optional(),
  BACKEND_GRPC_ADDR: z.string().default('backend:50051'),
  OUTPUT_DIR: z.string().default('/music'),
  WORK_DIR: z.string().default('/work'),
  ABCDE_CONFIG: z.string().optional(),
  OUTPUT_FORMAT: z.string().default('flac'),
  AUTO_RIP: boolish.default('true'),
  EJECT_ON_SUCCESS: boolish.default('true'),
  EJECT_ON_FAILURE: boolish.default('false'),
  UDEV_MONITOR: boolish.default('true'),
  POLL_INTERVAL_MS: z.coerce.number().default(5000),
});

export type BackendConfig = z.infer<typeof BackendEnv>;
export type RipperConfig = z.infer<typeof RipperEnv>;
