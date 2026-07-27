import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * The Cloudflare Worker handles this path before the application router so it
 * can use the D1 binding, validate the signed HttpOnly session and apply rate
 * limits. If a different runtime bypasses that gateway, fail closed.
 */
const DRIVE_FOLDER_PATTERN =
  /^https:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|open\?id=)([-\w]{10,})/i;

export async function POST(request: NextRequest) {
  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!DRIVE_FOLDER_PATTERN.test(url) || url.length > 500) {
    return NextResponse.json(
      { error: "请输入有效的 Google Drive 文件夹链接" },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { error: "安全扫描网关未启用" },
    { status: 503 },
  );
}
