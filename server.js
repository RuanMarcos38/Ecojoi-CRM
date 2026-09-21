const { createServer } = require('http');
const next = require('next');

const port = Number(process.env.PORT || 3000);
const hostname = '0.0.0.0';
const dev = process.env.NODE_ENV !== 'production';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res);
  }).listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`Ecojoi CRM ready on ${hostname}:${port}`);
  });
});
