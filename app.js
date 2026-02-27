const next = require('next');
const { createServer } = require('http');

// Forziamo production per evitare script di sviluppo/websocket
process.env.NODE_ENV = 'production';

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

const port = process.env.PORT || 3000;

app.prepare().then(() => {
    createServer((req, res) => {
        const parsedUrl = parse(req.url, true);
        handle(req, res, parsedUrl);
    }).listen(port, (err) => {
        if (err) throw err;
        console.log(`> Ready on http://localhost:${port}`);
    });
});
