// Vercel serverless entrypoint. Express handles the original request path.
// Do not import server.js: it starts a persistent HTTP listener and webhook worker.
const app = require("../app");

module.exports = app;
