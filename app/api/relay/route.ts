import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

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

async function handleRelay(req: NextRequest) {
  if (!TARGET_BASE) {
    return new NextResponse("Misconfigured: TARGET_DOMAIN is not set. Please set the TARGET_DOMAIN environment variable.", { status: 500 });
  }

  try {
    const url = new URL(req.url);
    // Remove the /api/relay prefix if it's there
    const path = url.pathname.replace(/^\/api\/relay/, "");
    const targetUrl = TARGET_BASE + path + url.search;

    const headers = new Headers();
    let clientIp = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for");

    req.headers.forEach((v, k) => {
      const lowerK = k.toLowerCase();
      if (STRIP_HEADERS.has(lowerK)) return;
      if (lowerK.startsWith("x-vercel-")) return;
      headers.set(k, v);
    });

    if (clientIp) {
      headers.set("x-forwarded-for", clientIp);
    }

    const fetchOpts: RequestInit = {
      method: req.method,
      headers: headers,
      redirect: "manual",
    };

    if (!["GET", "HEAD"].includes(req.method)) {
      fetchOpts.body = req.body;
      // @ts-ignore
      fetchOpts.duplex = "half";
    }

    const upstream = await fetch(targetUrl, fetchOpts);

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete("transfer-encoding");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("relay error:", err);
    return new NextResponse("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}

export const GET = handleRelay;
export const POST = handleRelay;
export const PUT = handleRelay;
export const DELETE = handleRelay;
export const PATCH = handleRelay;
export const HEAD = handleRelay;
export const OPTIONS = handleRelay;
