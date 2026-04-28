/**
 * Appwrite Function Relay (Node.js)
 * 
 * Paste this into your Appwrite Function index.js
 */

const { Readable } = require('stream');
// import { pipeline } from 'stream/promises'; // Use this if on Node 16+

module.exports = async function (context) {
  const { req, res, log, error } = context;

  const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

  if (!TARGET_BASE) {
    return res.json({ error: "Misconfigured: TARGET_DOMAIN is not set" }, 500);
  }

  const STRIP_HEADERS = new Set([
    "host",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "forwarded",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-forwarded-port",
  ]);

  try {
    const targetUrl = TARGET_BASE + req.path + (req.queryString ? '?' + req.queryString : '');

    const headers = {};
    let clientIp = req.headers['x-real-ip'] || req.headers['x-forwarded-for'];

    for (const key of Object.keys(req.headers)) {
      const k = key.toLowerCase();
      const v = req.headers[key];
      if (STRIP_HEADERS.has(k)) continue;
      if (k.startsWith('x-appwrite-')) continue;
      headers[k] = v;
    }

    if (clientIp) headers['x-forwarded-for'] = clientIp;

    const fetchOpts = {
      method: req.method,
      headers: headers,
      redirect: 'manual',
    };

    if (!['GET', 'HEAD'].includes(req.method)) {
      fetchOpts.body = req.bodyRaw; // Appwrite provides bodyRaw
    }

    const upstream = await fetch(targetUrl, fetchOpts);

    const upstreamHeaders = {};
    for (const [k, v] of upstream.headers) {
      if (k.toLowerCase() === 'transfer-encoding') continue;
      upstreamHeaders[k] = v;
    }

    // Appwrite Functions (older versions) might not support direct streaming in res.send
    // We try to return the full body if it's small, or stream if possible.
    const body = await upstream.arrayBuffer();
    
    return res.send(Buffer.from(body), upstream.status, upstreamHeaders);

  } catch (err) {
    error("relay error: " + err.message);
    return res.send("Bad Gateway: Tunnel Failed", 502);
  }
};
