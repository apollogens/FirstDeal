import { NextResponse } from "next/server";
import { AuthError, bearerSession, errorResponse, saveSession } from "@/lib/auth-server";

export async function GET(request: Request) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      throw new AuthError(403, "Запрос с другого сайта запрещён.");
    }
    const base = process.env.AUTH_API_URL;
    if (!base) throw new AuthError(503, "Адрес backend API не настроен.");
    const active = await bearerSession();
    if (active.tokens) await saveSession(active.tokens, active.remember);
    const sourceUrl = new URL(request.url);
    const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/tracked-topics${sourceUrl.search}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${active.token}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    const data: unknown = await response.json().catch(() => null);
    return NextResponse.json(data, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, true);
  }
}
