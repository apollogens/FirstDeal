import { NextResponse } from "next/server";
import { AuthError, bearerSession, checkOrigin, errorResponse, saveSession } from "@/lib/auth-server";

type RouteContext = { params: Promise<{ path?: string[] }> };
type Method = "GET" | "POST";

async function proxy(request: Request, context: RouteContext, method: Method) {
  try {
    if (method === "GET") {
      if (request.headers.get("sec-fetch-site") === "cross-site") {
        throw new AuthError(403, "Запрос с другого сайта запрещён.");
      }
    } else {
      checkOrigin(request);
    }

    const base = process.env.AUTH_API_URL;
    if (!base) throw new AuthError(503, "Адрес backend API не настроен.");

    const active = await bearerSession();
    if (active.tokens) await saveSession(active.tokens, active.remember);
    const { path = [] } = await context.params;
    const suffix = path.length ? `/${path.map(encodeURIComponent).join("/")}` : "";
    const sourceUrl = new URL(request.url);
    const body = method === "POST" ? await request.text() : undefined;
    const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/contexts${suffix}${sourceUrl.search}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${active.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body || undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    const data: unknown = await response.json().catch(() => null);
    return NextResponse.json(data, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, true);
  }
}

export const GET = (request: Request, context: RouteContext) => proxy(request, context, "GET");
export const POST = (request: Request, context: RouteContext) => proxy(request, context, "POST");
