import { NextResponse } from "next/server";
import { AuthError, bearerSession, errorResponse, saveSession } from "@/lib/auth-server";

type RouteContext = { params: Promise<{ path?: string[] }> };

function checkRequestOrigin(request: Request) {
  const allowed = (process.env.AUTH_APP_ORIGINS ?? process.env.AUTH_APP_ORIGIN ?? new URL(request.url).origin)
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  const origin = request.headers.get("origin");
  if (!origin || !allowed.includes(origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AuthError(403, "Запрос с другого сайта запрещён.");
  }
}

async function proxy(request: Request, context: RouteContext, method: "GET" | "POST" | "DELETE") {
  try {
    if (method === "POST" || method === "DELETE") checkRequestOrigin(request);
    const base = process.env.AUTH_API_URL;
    if (!base) throw new AuthError(503, "Адрес backend API не настроен.");

    const active = await bearerSession();
    if (active.tokens) await saveSession(active.tokens, active.remember);
    const { path = [] } = await context.params;
    const suffix = path.length ? `/${path.map(encodeURIComponent).join("/")}` : "";
    const contentType = request.headers.get("content-type");
    const isUpload = method === "POST" && path[0] === "upload";
    if (isUpload && !contentType?.startsWith("multipart/form-data;")) {
      throw new AuthError(415, "Ожидается JSONL-файл формы.");
    }

    const init: RequestInit & { duplex?: "half" } = {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${active.token}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
      },
      body: method === "POST" && isUpload ? request.body : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(isUpload ? 300_000 : 30_000),
    };
    if (init.body) init.duplex = "half";

    const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/datasets${suffix}`, init);
    const data: unknown = await response.json().catch(() => null);
    return NextResponse.json(data, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, true);
  }
}

export const GET = (request: Request, context: RouteContext) => proxy(request, context, "GET");
export const POST = (request: Request, context: RouteContext) => proxy(request, context, "POST");
export const DELETE = (request: Request, context: RouteContext) => proxy(request, context, "DELETE");
