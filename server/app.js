import http from 'node:http';
import https from 'node:https';
import { ensureCertificate } from './tls/certificate.js';
import { getLanAddresses } from './util/network.js';
import { createStaticHandler } from './http/static.js';
import { createApiHandler } from './http/api.js';
import { attachSocketServer } from './realtime/socketServer.js';
import { RoomManager } from './rooms/RoomManager.js';
import { FileStore } from './storage/FileStore.js';
import { createLogger } from './util/logger.js';

/**
 * Ensambla la aplicación. Recibe dependencias inyectables (almacén, logger)
 * para poder probarla sin disco ni consola.
 */
export async function createApp(config, deps = {}) {
  const logger = deps.logger ?? createLogger(config.logLevel);
  const store = deps.store ?? new FileStore(config.dataDir);
  await store.init();

  const rooms = new RoomManager({
    store,
    saveDelayMs: config.saveDelayMs,
    emptyRoomTtlMs: config.emptyRoomTtlMs,
    logger,
  });
  const sweep = () => rooms.sweep().catch((err) => logger.error('Error cerrando salas vacías:', err));
  const sweeper = setInterval(sweep, config.sweepIntervalMs);
  sweeper.unref?.();
  sweep();
  const serveShared = createStaticHandler(config.sharedDir, '/shared/');
  const servePublic = createStaticHandler(config.publicDir, '/');
  const handleApi = createApiHandler({ rooms, config });

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (await handleApi(req, res, url)) return;
      if (url.pathname === '/sala' || url.pathname === '/board') {
        if (servePublic(req, res, '/board.html')) return;
      }
      if (url.pathname === '/control') {
        if (servePublic(req, res, '/control.html')) return;
      }
      if (serveShared(req, res, url.pathname)) return;
      if (servePublic(req, res, url.pathname)) return;
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
    } catch (err) {
      logger.error('Error HTTP:', err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  };

  const server = http.createServer(handler);
  const wss = attachSocketServer(server, { rooms, config, logger });
  let secureServer = null;

  const listenOn = (srv, port, host) =>
    new Promise((resolve, reject) => {
      srv.once('error', reject);
      srv.listen(port, host, () => resolve(srv.address()));
    });

  return {
    server,
    rooms,
    get secureServer() {
      return secureServer;
    },
    listen(port = config.port, host = config.host) {
      return listenOn(server, port, host);
    },
    /**
     * Inicia el servidor HTTPS local (mismo contenido y misma sala que HTTP).
     * Devuelve la dirección o null si está desactivado.
     */
    async listenSecure(port = config.httpsPort, host = config.host) {
      if (!port && port !== 0) return null;
      const tls = await ensureCertificate(config.dataDir, getLanAddresses(), logger);
      secureServer = https.createServer({ key: tls.key, cert: tls.cert }, handler);
      wss.attach(secureServer);
      return listenOn(secureServer, port, host);
    },
    async close() {
      clearInterval(sweeper);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      await rooms.flush();
      await Promise.all(
        [server, secureServer].filter(Boolean).map((srv) => new Promise((resolve) => srv.close(resolve))),
      );
    },
  };
}
