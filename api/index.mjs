// Vercel Serverless Function bridging every /api/* request into the Hapi
// server defined in server/src/server.js. All /api/* traffic is funneled here
// by the vercel.json rewrite (a [...path].mjs catch-all only matched a single
// path segment on Vercel's router, 404ing /api/auth/signup and friends);
// rewrites preserve the original req.url, so Hapi still sees the full path.
//
// Hapi wires its internal http.Server's 'request' listener (this.listener)
// at construction time, not at server.start() — start() only calls
// listener.listen() to bind a socket. Since serverless functions never bind
// a socket themselves (Vercel hands us req/res directly), we call
// server.initialize() (Hapi's own documented no-socket startup path, meant
// for exactly this kind of platform) and then forward req/res straight into
// the listener's 'request' event, which runs Hapi's normal dispatch/routing.
import { buildServer } from '../server/src/server.js';

let serverPromise = null;

function getServer() {
  if (!serverPromise) {
    serverPromise = (async () => {
      const server = await buildServer();
      await server.initialize();
      return server;
    })();
  }
  return serverPromise;
}

export default async function handler(req, res) {
  const server = await getServer();
  server.listener.emit('request', req, res);
}
