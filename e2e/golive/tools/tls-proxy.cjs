// Local HTTPS front for the production-mode web app, so Secure cookies work in WebKit (Safari refuses Secure cookies on http://).
// Self-signed cert for localhost / *.localhost (generated into the gitignored golive-results/tls). QA only.
// Usage: node tls-proxy.cjs [listenPort=3443] [targetPort=3012]
const https = require('https'); const http = require('http'); const fs = require('fs'); const path = require('path');
const [listen = 3443, target = 3012] = process.argv.slice(2).map(Number);
const dir = path.join(__dirname, '..', '..', 'golive-results', 'tls');
https.createServer({ key: fs.readFileSync(path.join(dir, 'key.pem')), cert: fs.readFileSync(path.join(dir, 'cert.pem')) }, (req, res) => {
  const p = http.request({ host: '127.0.0.1', port: target, method: req.method, path: req.url, headers: { ...req.headers, 'x-forwarded-proto': 'https' } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  p.on('error', (e) => { res.statusCode = 502; res.end(String(e)); });
  req.pipe(p);
}).listen(listen, () => console.log(`https :${listen} -> http :${target}`));
