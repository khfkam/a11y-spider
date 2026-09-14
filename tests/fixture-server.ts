import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export async function startFixtureServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(async (req, res) => {
    const pathname = req.url?.split('?')[0] ?? '/';

    if (pathname === '/missing-alt.html') {
      const html = await readFile(join(fixturesDir, 'missing-alt.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (pathname === '/clean.html') {
      const html = await readFile(join(fixturesDir, 'clean.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start fixture server');
  }

  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

export async function stopFixtureServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
