// Original file: src/rippy.proto

import type { StartRip as _rippy_v1_StartRip, StartRip__Output as _rippy_v1_StartRip__Output } from '../../rippy/v1/StartRip';
import type { CancelRip as _rippy_v1_CancelRip, CancelRip__Output as _rippy_v1_CancelRip__Output } from '../../rippy/v1/CancelRip';
import type { EjectDisc as _rippy_v1_EjectDisc, EjectDisc__Output as _rippy_v1_EjectDisc__Output } from '../../rippy/v1/EjectDisc';
import type { RefreshDisc as _rippy_v1_RefreshDisc, RefreshDisc__Output as _rippy_v1_RefreshDisc__Output } from '../../rippy/v1/RefreshDisc';
import type { Long } from '@grpc/proto-loader';

export interface BackendToRipper {
  'commandId'?: (string);
  'timestampUnixMs'?: (number | string | Long);
  'startRip'?: (_rippy_v1_StartRip | null);
  'cancelRip'?: (_rippy_v1_CancelRip | null);
  'ejectDisc'?: (_rippy_v1_EjectDisc | null);
  'refreshDisc'?: (_rippy_v1_RefreshDisc | null);
  'command'?: "startRip"|"cancelRip"|"ejectDisc"|"refreshDisc";
}

export interface BackendToRipper__Output {
  'commandId': (string);
  'timestampUnixMs': (string);
  'startRip'?: (_rippy_v1_StartRip__Output | null);
  'cancelRip'?: (_rippy_v1_CancelRip__Output | null);
  'ejectDisc'?: (_rippy_v1_EjectDisc__Output | null);
  'refreshDisc'?: (_rippy_v1_RefreshDisc__Output | null);
  'command'?: "startRip"|"cancelRip"|"ejectDisc"|"refreshDisc";
}
