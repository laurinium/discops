// Original file: src/rippy.proto

export const RipEventType = {
  RIP_EVENT_TYPE_UNSPECIFIED: 'RIP_EVENT_TYPE_UNSPECIFIED',
  RIP_STARTED: 'RIP_STARTED',
  RIP_PROGRESS: 'RIP_PROGRESS',
  RIP_COMPLETED: 'RIP_COMPLETED',
  RIP_FAILED: 'RIP_FAILED',
  RIP_CANCELLED: 'RIP_CANCELLED',
} as const;

export type RipEventType =
  | 'RIP_EVENT_TYPE_UNSPECIFIED'
  | 0
  | 'RIP_STARTED'
  | 1
  | 'RIP_PROGRESS'
  | 2
  | 'RIP_COMPLETED'
  | 3
  | 'RIP_FAILED'
  | 4
  | 'RIP_CANCELLED'
  | 5

export type RipEventType__Output = typeof RipEventType[keyof typeof RipEventType]
