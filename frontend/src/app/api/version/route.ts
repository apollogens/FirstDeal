import { NextResponse } from "next/server";

export async function GET() {
  const base = process.env.AUTH_API_URL;
  if (!base) return NextResponse.json({ message: "Backend API unavailable" }, { status: 503 });
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/version`, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    return NextResponse.json(await response.json().catch(() => null), {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ message: "Backend API unavailable" }, { status: 503 });
  }
}
