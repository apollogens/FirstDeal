import { NextResponse } from "next/server";
import {
  AuthError,
  bearerSession,
  checkOrigin,
  errorResponse,
  saveSession,
} from "@/lib/auth-server";

type RouteContext = { params: Promise<{ path?: string[] }> };

async function proxy(request: Request, context: RouteContext, method: string) {
  try {
    if (method !== "GET") checkOrigin(request);
    if (
      method === "GET" &&
      request.headers.get("sec-fetch-site") === "cross-site"
    ) {
      throw new AuthError(403, "Запрос с другого сайта запрещен.");
    }

    const base = process.env.AUTH_API_URL;
    if (!base) throw new AuthError(503, "Адрес backend API не настроен.");

    const active = await bearerSession();
    if (active.tokens) await saveSession(active.tokens, active.remember);
    const params = await context.params;
    const pathPart = params.path && params.path.length > 0
      ? `/${params.path.map(encodeURIComponent).join("/")}`
      : "";
    const sourceUrl = new URL(request.url);
    const target = `${base.replace(/\/$/, "")}/api/v1/tasks${pathPart}${sourceUrl.search}`;
    const body = method === "GET" ? undefined : await request.text();

    const response = await fetch(target, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${active.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body || undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 204) {
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
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

export const GET = (request: Request, context: RouteContext) =>
  proxy(request, context, "GET");
export const POST = (request: Request, context: RouteContext) =>
  proxy(request, context, "POST");
export const PATCH = (request: Request, context: RouteContext) =>
  proxy(request, context, "PATCH");
export const DELETE = (request: Request, context: RouteContext) =>
  proxy(request, context, "DELETE");
