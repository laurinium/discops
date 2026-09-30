import { BackendEnv } from '@rippy/config';
import { createHttp } from './http.js';
import { startGrpc } from './grpc.js';
import { logger } from './logger.js';
import { AppState } from './state.js';
import { Store } from './store.js';

const config = BackendEnv.parse(process.env);
const store = new Store(config.DATABASE_PATH);
const state = new AppState(store);
seedExpectedRippers(config.EXPECTED_RIPPERS, state);
const grpcServer = startGrpc(state, config.BACKEND_GRPC_PORT);
const httpServer = createHttp(state, config.CORS_ORIGIN).listen(config.BACKEND_HTTP_PORT, () => logger.info({ port: config.BACKEND_HTTP_PORT, event: 'http_started' }));

function shutdown(signal: string): void {
  logger.info({ signal, event: 'shutdown' });
  httpServer.close(() => undefined);
  grpcServer.tryShutdown(() => { store.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
function seedExpectedRippers(value: string, appState: AppState): void {
  for (const spec of value.split(',').map((part) => part.trim()).filter(Boolean)) {
    const [ripperId, device, sgDevice] = spec.split(':');
    if (ripperId && device) appState.ensureDrive(ripperId, device, sgDevice || undefined);
  }
}

process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
