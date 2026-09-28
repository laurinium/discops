// Original file: src/rippy.proto

export const DiscEventType = {
  DISC_EVENT_TYPE_UNSPECIFIED: 'DISC_EVENT_TYPE_UNSPECIFIED',
  DISC_INSERTED: 'DISC_INSERTED',
  DISC_REMOVED: 'DISC_REMOVED',
  MEDIA_CHANGED: 'MEDIA_CHANGED',
  UNSUPPORTED_MEDIA: 'UNSUPPORTED_MEDIA',
} as const;

export type DiscEventType =
  | 'DISC_EVENT_TYPE_UNSPECIFIED'
  | 0
  | 'DISC_INSERTED'
  | 1
  | 'DISC_REMOVED'
  | 2
  | 'MEDIA_CHANGED'
  | 3
  | 'UNSUPPORTED_MEDIA'
  | 4

export type DiscEventType__Output = typeof DiscEventType[keyof typeof DiscEventType]
