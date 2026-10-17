// Stub WordPress server for kernel-p2-wordpress.test.js — runs as a CHILD
// process (the tool under test calls curl via execFileSync, which blocks
// the parent event loop; an in-process stub would deadlock). Prints
// PORT=<n> and LAST=<file> — every request is appended as JSON to the
// LAST file so the parent test can assert on auth/body.
const http = require('http');
const fs = require('fs');

const lastFile = process.env.WP_STUB_LAST;
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (lastFile) fs.writeFileSync(lastFile, JSON.stringify({ method: req.method, url: req.url, auth: req.headers.authorization || null, body }));
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && req.url.includes('/wp-json/wp/v2/pages')) {
      res.end(JSON.stringify([{ id: 42, slug: 'muse-for-business-workshop', status: 'publish', modified: '2026-10-01T00:00:00', title: { rendered: 'Muse for Business Workshop' }, content: { rendered: '<p>October 4</p>' } }]));
    } else if (req.method === 'POST' && req.url.includes('/wp-json/wp/v2/pages/42')) {
      const parsed = JSON.parse(body || '{}');
      res.end(JSON.stringify({ id: 42, slug: 'muse-for-business-workshop', status: parsed.status || 'publish', modified: '2026-10-17T01:00:00', content: { rendered: parsed.content || '' } }));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ code: 'rest_no_route' }));
    }
  });
});
server.listen(0, '127.0.0.1', () => { console.log(`PORT=${server.address().port}`); });
