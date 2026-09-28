// Original file: src/rippy.proto


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
  '_trayStatus'?: "trayStatus";
  '_discId'?: "discId";
  '_artist'?: "artist";
  '_album'?: "album";
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
  '_trayStatus'?: "trayStatus";
  '_discId'?: "discId";
  '_artist'?: "artist";
  '_album'?: "album";
  '_currentTrack'?: "currentTrack";
  '_totalTracks'?: "totalTracks";
  '_progressPercent'?: "progressPercent";
  '_currentFile'?: "currentFile";
  '_error'?: "error";
}
