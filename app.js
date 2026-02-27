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
const port = process.env.PORT || 3000;

console.log('--- Starting Next.js in Production Mode ---');

app.prepare()
    .then(() => {
        createServer((req, res) => {
            const parsedUrl = parse(req.url, true);
            handle(req, res, parsedUrl);
        }).listen(port, (err) => {
            if (err) {
                console.error('Failed to start server:', err);
                process.exit(1);
            }
            console.log(`> Server listening on port ${port}`);
        });
    })
    .catch((err) => {
        console.error('Fatal Error during app.prepare():', err);
        // Explicitly send error to Passenger log
        process.stderr.write(err.stack + '\n');
        process.exit(1);
    });
