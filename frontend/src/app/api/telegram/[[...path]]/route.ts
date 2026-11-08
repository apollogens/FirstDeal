import { NextResponse } from "next/server";
import { AuthError, bearerSession, checkOrigin, errorResponse, saveSession } from "@/lib/auth-server";

type Context = { params: Promise<{ path?: string[] }> };

async function proxy(request: Request, context: Context, method: "GET" | "POST" | "DELETE") {
  try {
    if (method !== "GET") checkOrigin(request);
    if (method === "GET" && request.headers.get("sec-fetch-site") === "cross-site") throw new AuthError(403, "Forbidden");
    const base = process.env.AUTH_API_URL;
    if (!base) throw new AuthError(503, "Backend API unavailable");
    const active = await bearerSession();
    if (active.tokens) await saveSession(active.tokens, active.remember);
    const { path = [] } = await context.params;
    const suffix = path.map(encodeURIComponent).join("/");
    const body = method === "POST" ? await request.text() : undefined;
    const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/telegram/${suffix}`, {
      method,
      headers: { Authorization: `Bearer ${active.token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    return NextResponse.json(await response.json().catch(() => null), { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, true);
  }
}

export const GET = (request: Request, context: Context) => proxy(request, context, "GET");
export const POST = (request: Request, context: Context) => proxy(request, context, "POST");
export const DELETE = (request: Request, context: Context) => proxy(request, context, "DELETE");
