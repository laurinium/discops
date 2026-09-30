// Original file: src/rippy.proto


export interface RipperHello {
  'device'?: (string);
  'hostname'?: (string);
  'autoRip'?: (boolean);
  'outputFormat'?: (string);
  'outputDir'?: (string);
  'sgDevice'?: (string);
  'driveVendor'?: (string);
  'driveModel'?: (string);
  'driveRevision'?: (string);
  'canOpenTray'?: (boolean);
  'canCloseTray'?: (boolean);
  'canLockTray'?: (boolean);
  'canReadDvd'?: (boolean);
  'canWriteCdr'?: (boolean);
  '_sgDevice'?: "sgDevice";
  '_driveVendor'?: "driveVendor";
  '_driveModel'?: "driveModel";
  '_driveRevision'?: "driveRevision";
  '_canOpenTray'?: "canOpenTray";
  '_canCloseTray'?: "canCloseTray";
  '_canLockTray'?: "canLockTray";
  '_canReadDvd'?: "canReadDvd";
  '_canWriteCdr'?: "canWriteCdr";
}

export interface RipperHello__Output {
  'device': (string);
  'hostname': (string);
  'autoRip': (boolean);
  'outputFormat': (string);
  'outputDir': (string);
  'sgDevice'?: (string);
  'driveVendor'?: (string);
  'driveModel'?: (string);
  'driveRevision'?: (string);
  'canOpenTray'?: (boolean);
  'canCloseTray'?: (boolean);
  'canLockTray'?: (boolean);
  'canReadDvd'?: (boolean);
  'canWriteCdr'?: (boolean);
  '_sgDevice'?: "sgDevice";
  '_driveVendor'?: "driveVendor";
  '_driveModel'?: "driveModel";
  '_driveRevision'?: "driveRevision";
  '_canOpenTray'?: "canOpenTray";
  '_canCloseTray'?: "canCloseTray";
  '_canLockTray'?: "canLockTray";
  '_canReadDvd'?: "canReadDvd";
  '_canWriteCdr'?: "canWriteCdr";
}
