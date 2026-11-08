import { NextResponse } from "next/server";
import {
  AuthError,
  bearerSession,
  errorResponse,
  saveSession,
} from "@/lib/auth-server";

type DocumentsRouteContext = { params: Promise<{ path?: string[] }> };

function checkRequestOrigin(request: Request) {
  const allowed = (
    process.env.AUTH_APP_ORIGINS ??
    process.env.AUTH_APP_ORIGIN ??
    new URL(request.url).origin
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = request.headers.get("origin");
  if (
    !origin ||
    !allowed.includes(origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new AuthError(403, "Запрос с другого сайта запрещён.");
  }
}

async function proxy(
  request: Request,
  context: DocumentsRouteContext,
  method: "GET" | "POST" | "DELETE",
) {
  try {
    if (method !== "GET") checkRequestOrigin(request);
    if (
      method === "GET" &&
      request.headers.get("sec-fetch-site") === "cross-site"
    ) {
      throw new AuthError(403, "Запрос с другого сайта запрещён.");
    }

    const base = process.env.AUTH_API_URL;
    if (!base) throw new AuthError(503, "Адрес backend API не настроен.");

    const active = await bearerSession();
    if (active.tokens) await saveSession(active.tokens, active.remember);
    const { path = [] } = await context.params;
    const suffix = path.length
      ? `/${path.map(encodeURIComponent).join("/")}`
      : "";
    const sourceUrl = new URL(request.url);
    const previewRequested = method === "GET" && sourceUrl.searchParams.get("preview") === "1";
    const target = `${base.replace(/\/$/, "")}/api/v1/documents${suffix}${sourceUrl.search}`;
    const contentType = request.headers.get("content-type");

    const isSearch = method === "POST" && path.length === 1 && path[0] === "search";
    if (method === "POST" && isSearch && !contentType?.startsWith("application/json")) {
      throw new AuthError(415, "Ожидается JSON.");
    }
    if (method === "POST" && !isSearch && !contentType?.startsWith("multipart/form-data;")) {
      throw new AuthError(415, "Ожидается файл формы.");
    }

    const init: RequestInit & { duplex?: "half" } = {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${active.token}`,
        ...(method === "POST" && contentType ? { "Content-Type": contentType } : {}),
      },
      body: method === "POST" ? request.body : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(method === "POST" ? 120_000 : 8_000),
    };
    if (method === "POST") init.duplex = "half";

    const response = await fetch(target, init);
    if (response.status === 204) {
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const responseType = response.headers.get("content-type") ?? "";
    if (response.ok && !responseType.includes("application/json")) {
      const headers = new Headers({ "Cache-Control": "no-store" });
      if (responseType) headers.set("Content-Type", responseType);
      const disposition = response.headers.get("content-disposition");
      if (previewRequested) headers.set("Content-Disposition", "inline");
      else if (disposition) headers.set("Content-Disposition", disposition);
      return new Response(response.body, { status: response.status, headers });
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

export const GET = (request: Request, context: DocumentsRouteContext) =>
  proxy(request, context, "GET");
export const POST = (request: Request, context: DocumentsRouteContext) =>
  proxy(request, context, "POST");
export const DELETE = (request: Request, context: DocumentsRouteContext) =>
  proxy(request, context, "DELETE");
