// Original file: src/rippy.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { BackendToRipper as _rippy_v1_BackendToRipper, BackendToRipper__Output as _rippy_v1_BackendToRipper__Output } from '../../rippy/v1/BackendToRipper';
import type { RipperToBackend as _rippy_v1_RipperToBackend, RipperToBackend__Output as _rippy_v1_RipperToBackend__Output } from '../../rippy/v1/RipperToBackend';

export interface RipperServiceClient extends grpc.Client {
  Connect(metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientDuplexStream<_rippy_v1_RipperToBackend, _rippy_v1_BackendToRipper__Output>;
  Connect(options?: grpc.CallOptions): grpc.ClientDuplexStream<_rippy_v1_RipperToBackend, _rippy_v1_BackendToRipper__Output>;
  connect(metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientDuplexStream<_rippy_v1_RipperToBackend, _rippy_v1_BackendToRipper__Output>;
  connect(options?: grpc.CallOptions): grpc.ClientDuplexStream<_rippy_v1_RipperToBackend, _rippy_v1_BackendToRipper__Output>;
  
}

export interface RipperServiceHandlers extends grpc.UntypedServiceImplementation {
  Connect: grpc.handleBidiStreamingCall<_rippy_v1_RipperToBackend__Output, _rippy_v1_BackendToRipper>;
  
}

export interface RipperServiceDefinition extends grpc.ServiceDefinition {
  Connect: MethodDefinition<_rippy_v1_RipperToBackend, _rippy_v1_BackendToRipper, _rippy_v1_RipperToBackend__Output, _rippy_v1_BackendToRipper__Output>
}
