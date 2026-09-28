// Original file: src/rippy.proto

import type { RipperHello as _rippy_v1_RipperHello, RipperHello__Output as _rippy_v1_RipperHello__Output } from '../../rippy/v1/RipperHello';
import type { Heartbeat as _rippy_v1_Heartbeat, Heartbeat__Output as _rippy_v1_Heartbeat__Output } from '../../rippy/v1/Heartbeat';
import type { DriveState as _rippy_v1_DriveState, DriveState__Output as _rippy_v1_DriveState__Output } from '../../rippy/v1/DriveState';
import type { DiscEvent as _rippy_v1_DiscEvent, DiscEvent__Output as _rippy_v1_DiscEvent__Output } from '../../rippy/v1/DiscEvent';
import type { RipEvent as _rippy_v1_RipEvent, RipEvent__Output as _rippy_v1_RipEvent__Output } from '../../rippy/v1/RipEvent';
import type { RipLog as _rippy_v1_RipLog, RipLog__Output as _rippy_v1_RipLog__Output } from '../../rippy/v1/RipLog';
import type { Long } from '@grpc/proto-loader';

export interface RipperToBackend {
  'ripperId'?: (string);
  'timestampUnixMs'?: (number | string | Long);
  'hello'?: (_rippy_v1_RipperHello | null);
  'heartbeat'?: (_rippy_v1_Heartbeat | null);
  'driveState'?: (_rippy_v1_DriveState | null);
  'discEvent'?: (_rippy_v1_DiscEvent | null);
  'ripEvent'?: (_rippy_v1_RipEvent | null);
  'ripLog'?: (_rippy_v1_RipLog | null);
  'event'?: "hello"|"heartbeat"|"driveState"|"discEvent"|"ripEvent"|"ripLog";
}

export interface RipperToBackend__Output {
  'ripperId': (string);
  'timestampUnixMs': (string);
  'hello'?: (_rippy_v1_RipperHello__Output | null);
  'heartbeat'?: (_rippy_v1_Heartbeat__Output | null);
  'driveState'?: (_rippy_v1_DriveState__Output | null);
  'discEvent'?: (_rippy_v1_DiscEvent__Output | null);
  'ripEvent'?: (_rippy_v1_RipEvent__Output | null);
  'ripLog'?: (_rippy_v1_RipLog__Output | null);
  'event'?: "hello"|"heartbeat"|"driveState"|"discEvent"|"ripEvent"|"ripLog";
}
