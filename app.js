const next = require('next');
const { createServer } = require('http');
const { parse } = require('url');

// Strict production mode
process.env.NODE_ENV = 'production';

const app = next({
    dev: false,
    dir: __dirname,
    conf: {
        images: { unoptimized: true }
    }
});

const handle = app.getRequestHandler();
const port = Number(process.env.PORT) || 3000;
// Passenger/Plesk: ascolto esplicito su tutte le interfacce (evita bind solo su localhost)
const host = process.env.HOST || process.env.BIND_HOST || '0.0.0.0';

console.log('--- Starting Next.js in Production Mode ---');
console.log(`--- host=${host} port=${port} ---`);

app.prepare()
    .then(() => {
        const server = createServer((req, res) => {
            const parsedUrl = parse(req.url, true);
            handle(req, res, parsedUrl);
        });
        server.listen(port, host, () => {
            console.log(`> Server listening on http://${host}:${port}`);
        });
        server.on('error', (err) => {
            console.error('HTTP server error:', err);
            process.exit(1);
        });
    })
    .catch((err) => {
        console.error('Fatal Error during app.prepare():', err);
        // Explicitly send error to Passenger log
        process.stderr.write(err.stack + '\n');
        process.exit(1);
    });
