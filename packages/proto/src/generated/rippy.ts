import type * as grpc from '@grpc/grpc-js';
import type { EnumTypeDefinition, MessageTypeDefinition } from '@grpc/proto-loader';

import type { RipperServiceClient as _rippy_v1_RipperServiceClient, RipperServiceDefinition as _rippy_v1_RipperServiceDefinition } from './rippy/v1/RipperService';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  rippy: {
    v1: {
      BackendToRipper: MessageTypeDefinition
      CancelRip: MessageTypeDefinition
      CloseTray: MessageTypeDefinition
      DiscEvent: MessageTypeDefinition
      DiscEventType: EnumTypeDefinition
      DriveState: MessageTypeDefinition
      EjectDisc: MessageTypeDefinition
      Heartbeat: MessageTypeDefinition
      OpenTray: MessageTypeDefinition
      RefreshDisc: MessageTypeDefinition
      ResetDrive: MessageTypeDefinition
      RipEvent: MessageTypeDefinition
      RipEventType: EnumTypeDefinition
      RipLog: MessageTypeDefinition
      RipperHello: MessageTypeDefinition
      RipperService: SubtypeConstructor<typeof grpc.Client, _rippy_v1_RipperServiceClient> & { service: _rippy_v1_RipperServiceDefinition }
      RipperToBackend: MessageTypeDefinition
      StartRip: MessageTypeDefinition
      TrackMetadata: MessageTypeDefinition
    }
  }
}

