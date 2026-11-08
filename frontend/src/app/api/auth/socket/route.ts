import { NextResponse } from "next/server";
import { bearerSession, errorResponse, saveSession } from "@/lib/auth-server";

export async function GET() {
  try {
    const session = await bearerSession();
    if (session.tokens) await saveSession(session.tokens, session.remember);

    const base = process.env.NEXT_PUBLIC_WS_API_URL ?? process.env.AUTH_API_URL;
    if (!base) return NextResponse.json({ message: "Адрес WebSocket-сервиса не настроен." }, { status: 503 });

    const url = new URL(base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return NextResponse.json(
      { baseUrl: `${url.origin}/api/v1`, token: session.token },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, true);
  }
}
