// Original file: src/rippy.proto

import type { DiscEventType as _rippy_v1_DiscEventType, DiscEventType__Output as _rippy_v1_DiscEventType__Output } from '../../rippy/v1/DiscEventType';

export interface DiscEvent {
  'type'?: (_rippy_v1_DiscEventType);
  'device'?: (string);
  'discId'?: (string);
  'reason'?: (string);
  '_discId'?: "discId";
  '_reason'?: "reason";
}

export interface DiscEvent__Output {
  'type': (_rippy_v1_DiscEventType__Output);
  'device': (string);
  'discId'?: (string);
  'reason'?: (string);
  '_discId'?: "discId";
  '_reason'?: "reason";
}
