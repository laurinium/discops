// Original file: src/rippy.proto

import type { TrackMetadata as _rippy_v1_TrackMetadata, TrackMetadata__Output as _rippy_v1_TrackMetadata__Output } from '../../rippy/v1/TrackMetadata';

export interface DriveState {
  'device'?: (string);
  'mediaPresent'?: (boolean);
  'state'?: (string);
  'discId'?: (string);
  'artist'?: (string);
  'album'?: (string);
  'currentTrack'?: (number);
  'totalTracks'?: (number);
  'progressPercent'?: (number | string);
  'currentFile'?: (string);
  'error'?: (string);
  'trayStatus'?: (string);
  'tracks'?: (_rippy_v1_TrackMetadata)[];
  'releaseDate'?: (string);
  'musicBrainzDiscId'?: (string);
  'musicBrainzReleaseId'?: (string);
  'discNumber'?: (number);
  'totalDiscs'?: (number);
  '_trayStatus'?: "trayStatus";
  '_discId'?: "discId";
  '_artist'?: "artist";
  '_album'?: "album";
  '_releaseDate'?: "releaseDate";
  '_musicBrainzDiscId'?: "musicBrainzDiscId";
  '_musicBrainzReleaseId'?: "musicBrainzReleaseId";
  '_discNumber'?: "discNumber";
  '_totalDiscs'?: "totalDiscs";
  '_currentTrack'?: "currentTrack";
  '_totalTracks'?: "totalTracks";
  '_progressPercent'?: "progressPercent";
  '_currentFile'?: "currentFile";
  '_error'?: "error";
}

export interface DriveState__Output {
  'device': (string);
  'mediaPresent': (boolean);
  'state': (string);
  'discId'?: (string);
  'artist'?: (string);
  'album'?: (string);
  'currentTrack'?: (number);
  'totalTracks'?: (number);
  'progressPercent'?: (number);
  'currentFile'?: (string);
  'error'?: (string);
  'trayStatus'?: (string);
  'tracks': (_rippy_v1_TrackMetadata__Output)[];
  'releaseDate'?: (string);
  'musicBrainzDiscId'?: (string);
  'musicBrainzReleaseId'?: (string);
  'discNumber'?: (number);
  'totalDiscs'?: (number);
  '_trayStatus'?: "trayStatus";
  '_discId'?: "discId";
  '_artist'?: "artist";
  '_album'?: "album";
  '_releaseDate'?: "releaseDate";
  '_musicBrainzDiscId'?: "musicBrainzDiscId";
  '_musicBrainzReleaseId'?: "musicBrainzReleaseId";
  '_discNumber'?: "discNumber";
  '_totalDiscs'?: "totalDiscs";
  '_currentTrack'?: "currentTrack";
  '_totalTracks'?: "totalTracks";
  '_progressPercent'?: "progressPercent";
  '_currentFile'?: "currentFile";
  '_error'?: "error";
}
