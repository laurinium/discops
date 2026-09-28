// Original file: src/rippy.proto

import type { RipEventType as _rippy_v1_RipEventType, RipEventType__Output as _rippy_v1_RipEventType__Output } from '../../rippy/v1/RipEventType';

export interface RipEvent {
  'type'?: (_rippy_v1_RipEventType);
  'jobId'?: (string);
  'currentTrack'?: (number);
  'totalTracks'?: (number);
  'progressPercent'?: (number | string);
  'currentFile'?: (string);
  'error'?: (string);
  '_currentTrack'?: "currentTrack";
  '_totalTracks'?: "totalTracks";
  '_progressPercent'?: "progressPercent";
  '_currentFile'?: "currentFile";
  '_error'?: "error";
}

export interface RipEvent__Output {
  'type': (_rippy_v1_RipEventType__Output);
  'jobId': (string);
  'currentTrack'?: (number);
  'totalTracks'?: (number);
  'progressPercent'?: (number);
  'currentFile'?: (string);
  'error'?: (string);
  '_currentTrack'?: "currentTrack";
  '_totalTracks'?: "totalTracks";
  '_progressPercent'?: "progressPercent";
  '_currentFile'?: "currentFile";
  '_error'?: "error";
}
