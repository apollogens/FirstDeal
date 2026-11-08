import { NextResponse } from "next/server";
import { AuthError, bearerSession, checkOrigin, errorResponse, saveSession } from "@/lib/auth-server";

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: RouteContext, method: "GET" | "POST") {
  try {
    if (method === "POST") checkOrigin(request);
    if (method === "GET" && request.headers.get("sec-fetch-site") === "cross-site") {
      throw new AuthError(403, "Запрос с другого сайта запрещён.");
    }
    const base = process.env.AUTH_API_URL;
    if (!base) throw new AuthError(503, "Адрес backend API не настроен.");

    const active = await bearerSession();
    if (active.tokens) await saveSession(active.tokens, active.remember);
    const { path } = await context.params;
    const query = new URL(request.url).search;
    const target = `${base.replace(/\/$/, "")}/api/v1/mail/${path.map(encodeURIComponent).join("/")}${query}`;
    const body = method === "POST" ? await request.text() : undefined;
    const response = await fetch(target, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${active.token}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(method === "POST" && (path[0] === "send" || path[0] === "accounts" || path[0] === "sync") ? 30_000 : 15_000),
    });
    if (response.status === 204) {
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }
    const data: unknown = await response.json().catch(() => null);
    return NextResponse.json(data, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, true);
  }
}

export const GET = (request: Request, context: RouteContext) => proxy(request, context, "GET");
export const POST = (request: Request, context: RouteContext) => proxy(request, context, "POST");
