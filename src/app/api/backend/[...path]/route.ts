import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_API_URL = (
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://nightgram-production.up.railway.app/api"
).replace(/\/$/, "");

async function proxy(req: NextRequest, ctx: { params: { path: string[] } }) {
  const path = ctx.params.path.join("/");
  const url = new URL(req.url);
  const target = `${BACKEND_API_URL}/${path}${url.search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
  };

  if (!['GET', 'HEAD'].includes(req.method)) {
    init.body = await req.arrayBuffer();
  }

  try {
    const res = await fetch(target, init);
    const body = await res.arrayBuffer();
    const outHeaders = new Headers(res.headers);
    outHeaders.delete("content-encoding");
    outHeaders.delete("content-length");
    outHeaders.set("cache-control", "no-store");
    return new NextResponse(body, { status: res.status, statusText: res.statusText, headers: outHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Backend proxy failed", detail: message }, { status: 502 });
  }
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx); }
export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx); }
export async function PUT(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx); }
export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx); }
export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx); }
