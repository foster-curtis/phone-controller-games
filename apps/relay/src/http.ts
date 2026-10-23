// Plain HTTP surface: `GET /healthz` for Fly checks; WebSocket upgrades are handled by `ws`.
import { createServer, type Server } from 'node:http';

export function createHttpServer(): Server {
  return createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if ((req.method === 'GET' || req.method === 'HEAD') && path === '/healthz') {
      res.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end('ok');
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });
}
