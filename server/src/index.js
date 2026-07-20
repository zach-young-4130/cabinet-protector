import 'dotenv/config';
import { buildServer } from './server.js';

const server = await buildServer();

await server.start();
console.log(`ProTectVinyl API running at ${server.info.uri}`);

process.on('unhandledRejection', (err) => {
  console.error(err);
  process.exit(1);
});
