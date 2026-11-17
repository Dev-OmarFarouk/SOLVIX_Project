const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const DEFAULT_PORT = 8080;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.bin': 'application/octet-stream',
    '.wasm': 'application/wasm'
};

function startServer(port) {
    const server = http.createServer((req, res) => {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const parsedUrl = url.parse(req.url);
        let pathname = decodeURIComponent(parsedUrl.pathname);

        // Strip /devices prefix for static asset requests if present
        if (pathname.startsWith('/devices/assets/')) pathname = pathname.replace('/devices', '');
        else if (pathname.startsWith('/devices/models/')) pathname = pathname.replace('/devices', '');
        else if (pathname.startsWith('/devices/draco/')) pathname = pathname.replace('/devices', '');
        else if (pathname.startsWith('/devices/textures/')) pathname = pathname.replace('/devices', '');
        else if (pathname.startsWith('/devices/js/')) pathname = pathname.replace('/devices', '');

        const isSpaRoute = pathname.startsWith('/devices') || pathname === '/worlds' || pathname === '/game' || pathname === '/solvix';

        if (pathname === '/' || pathname === '' || isSpaRoute) {
            pathname = fs.existsSync(path.join(ROOT_DIR, 'index.html')) ? '/index.html' : '/solvix.html';
        }

        const filePath = path.join(ROOT_DIR, pathname);

        // Prevent directory traversal
        if (!filePath.startsWith(ROOT_DIR)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('403 Forbidden');
            return;
        }

        fs.stat(filePath, (err, stats) => {
            if (err || !stats.isFile()) {
                // SPA fallback for routes without file extension
                if (!path.extname(pathname)) {
                    const fallbackHtml = fs.existsSync(path.join(ROOT_DIR, 'index.html')) ? path.join(ROOT_DIR, 'index.html') : path.join(ROOT_DIR, 'solvix.html');
                    if (fs.existsSync(fallbackHtml)) {
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        fs.createReadStream(fallbackHtml).pipe(res);
                        return;
                    }
                }
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end(`404 Not Found: ${pathname}`);
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            const total = stats.size;

            // Handle Range headers (essential for audio/video)
            const range = req.headers.range;
            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const partialStart = parts[0];
                const partialEnd = parts[1];

                const start = parseInt(partialStart, 10);
                const end = partialEnd ? parseInt(partialEnd, 10) : total - 1;
                const chunksize = (end - start) + 1;

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${total}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': contentType
                });

                const stream = fs.createReadStream(filePath, { start, end });
                stream.pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': total,
                    'Content-Type': contentType,
                    'Accept-Ranges': 'bytes'
                });
                const stream = fs.createReadStream(filePath);
                stream.pipe(res);
            }
        });
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${port} in use, trying ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('Server error:', err);
        }
    });

    server.listen(port, () => {
        console.log(`Solvix server is running at http://localhost:${port}/`);
    });
}

startServer(DEFAULT_PORT);
