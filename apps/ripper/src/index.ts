import { RipperEnv } from '@rippy/config';
import { createLogger } from './logger.js';
import { RipperController } from './controller.js';

const config = RipperEnv.parse(process.env);
const logger = createLogger(config.RIPPER_ID);
const controller = new RipperController(config, logger);
controller.start();

function shutdown(signal: string): void {
  logger.info({ event: 'shutdown', signal });
  controller.stop();
  setTimeout(() => process.exit(0), controller.running ? 12_500 : 500).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
