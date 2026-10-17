// Stub web server for the webFetch tests in kernel-p2-tools.test.js —
// child process for the same execFileSync deadlock reason as the WP stub.
const http = require('http');
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html><head><title>Stub Page</title><style>.x{color:red}</style><script>var noise = "SCRIPTNOISE";</script></head>
<body><h1>Workshop</h1><p>The workshop is on <b>October 18</b> at 11am.</p><p>Second&nbsp;paragraph &amp; entities.</p></body></html>`);
});
server.listen(0, '127.0.0.1', () => { console.log(`PORT=${server.address().port}`); });
