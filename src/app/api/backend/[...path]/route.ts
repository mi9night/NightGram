import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_API_URL = (
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://nightgram-production-0ceb.up.railway.app/api"
).replace(/\/$/, "");

const FORWARDED_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "user-agent",
  "x-forwarded-for",
  "x-request-id",
  "x-nightgram-health-check",
  "x-nightgram-platform",
  "x-nightgram-device-name",
] as const;

function safePath(parts: string[]): string | null {
  if (!Array.isArray(parts) || parts.length === 0) return null;
  if (parts.some((part) => !part || part === "." || part === ".." || part.includes("\\"))) return null;
  return parts.map((part) => encodeURIComponent(part)).join("/");
}

type ProxyContext = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, ctx: ProxyContext) {
  const { path: parts } = await ctx.params;
  const path = safePath(parts);
  if (!path) return NextResponse.json({ error: "invalid_path" }, { status: 400 });

  const sourceUrl = new URL(req.url);
  const target = `${BACKEND_API_URL}/${path}${sourceUrl.search}`;
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const headers = new Headers();
  for (const key of FORWARDED_HEADERS) {
    const value = req.headers.get(key);
    if (value) headers.set(key, value);
  }
  headers.set("x-request-id", requestId);

  const controller = new AbortController();
  const proxyTimeoutMs = path === "health" ? 8_000 : 25_000;
  const timeout = setTimeout(() => controller.abort(), proxyTimeoutMs);
  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
    signal: controller.signal,
  };

  if (!["GET", "HEAD"].includes(req.method)) init.body = await req.arrayBuffer();

  try {
    const res = await fetch(target, init);
    const body = await res.arrayBuffer();
    const outHeaders = new Headers();
    const contentType = res.headers.get("content-type");
    const retryAfter = res.headers.get("retry-after");
    const backendRequestId = res.headers.get("x-request-id") || requestId;
    if (contentType) outHeaders.set("content-type", contentType);
    if (retryAfter) outHeaders.set("retry-after", retryAfter);
    outHeaders.set("x-request-id", backendRequestId);
    outHeaders.set("cache-control", "no-store");
    return new NextResponse(body, { status: res.status, statusText: res.statusText, headers: outHeaders });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: timedOut ? "backend_timeout" : "backend_unavailable",
        message: timedOut ? "Сервер отвечает слишком долго" : "Не удалось подключиться к серверу",
        requestId,
      },
      { status: timedOut ? 504 : 502, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: NextRequest, ctx: ProxyContext) { return proxy(req, ctx); }
export async function POST(req: NextRequest, ctx: ProxyContext) { return proxy(req, ctx); }
export async function PUT(req: NextRequest, ctx: ProxyContext) { return proxy(req, ctx); }
export async function PATCH(req: NextRequest, ctx: ProxyContext) { return proxy(req, ctx); }
export async function DELETE(req: NextRequest, ctx: ProxyContext) { return proxy(req, ctx); }
