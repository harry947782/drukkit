// Minimal static file server for the publish/ directory.
// Used by playwright.config.js webServer during test runs.
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT        = 3000;
const PUBLISH_DIR = path.join(__dirname, 'publish');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript',
    '.css':  'text/css',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.ico':  'image/x-icon',
};

http.createServer(function (req, res) {
    var urlPath = req.url.split('?')[0].split('#')[0];
    if (urlPath === '/') urlPath = '/index.html';

    var filePath    = path.join(PUBLISH_DIR, urlPath);
    var ext         = path.extname(filePath);
    var contentType = MIME[ext] || 'text/plain';

    fs.readFile(filePath, function (err, data) {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
}).listen(PORT);
