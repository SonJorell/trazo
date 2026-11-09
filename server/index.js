#!/usr/bin/env node
import QRCode from 'qrcode';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { createLogger } from './util/logger.js';
import { getLanAddresses } from './util/network.js';

const config = loadConfig();
const logger = createLogger(config.logLevel);

const app = await createApp(config, { logger });

try {
  await app.listen();
} catch (err) {
  if (err.code === 'EADDRINUSE') {
    logger.error(`El puerto ${config.port} está ocupado. Cierra la otra instancia o usa otro: set PORT=3090`);
  } else {
    logger.error('No se pudo iniciar el servidor:', err.message);
  }
  process.exit(1);
}

const lan = getLanAddresses().map((ip) => `http://${ip}:${config.port}`);
console.log('\n  Trazo — pizarra colaborativa\n');
console.log(`  En este PC:        http://localhost:${config.port}`);
for (const url of lan) console.log(`  Desde el celular:  ${url}`);
if (lan[0]) {
  console.log('\n  Escanea con el celular (misma Wi-Fi):\n');
  console.log(await QRCode.toString(lan[0], { type: 'terminal', small: true }));
} else {
  console.log('\n  No se detectó una red local. Conecta el PC a la Wi-Fi para usarlo desde el celular.\n');
}
console.log('  Cierra esta ventana o pulsa Ctrl+C para detener.\n');

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  logger.info('Guardando y cerrando…');
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
