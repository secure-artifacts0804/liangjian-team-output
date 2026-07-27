import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

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

  const scannerUrl = process.env.DRIVE_SCANNER_URL;
  const scannerSecret = process.env.DRIVE_SCANNER_SECRET;
  if (!scannerUrl || !scannerSecret) {
    return NextResponse.json(
      { error: "扫描服务尚未连接，界面功能可以先行体验" },
      { status: 503 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(scannerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, secret: scannerSecret }),
      signal: controller.signal,
      redirect: "follow",
    });
    const result = (await response.json()) as {
      ok?: boolean;
      error?: string;
      folderName?: unknown;
      images?: unknown;
      videos?: unknown;
      selected?: unknown;
      selectedFolders?: unknown;
      videoDurationSeconds?: unknown;
      videoDurationUnavailable?: unknown;
      videoDetails?: unknown;
      videoDetailsTruncated?: unknown;
    };
    if (!response.ok || result?.ok === false) {
      return NextResponse.json(
        { error: result?.error || "无法读取该文件夹，请检查共享权限" },
        { status: 502 },
      );
    }
    const videoDetails = Array.isArray(result.videoDetails)
      ? result.videoDetails.slice(0, 500).map((item) => {
          const detail = item as {
            name?: unknown;
            durationSeconds?: unknown;
          };
          const duration = Number(detail.durationSeconds);
          return {
            name: String(detail.name || "未命名视频").slice(0, 120),
            durationSeconds:
              detail.durationSeconds == null || !Number.isFinite(duration)
                ? null
                : Math.max(0, Math.round(duration)),
          };
        })
      : [];

    return NextResponse.json({
      folderName: String(result.folderName || "Google Drive 文件夹").slice(
        0,
        120,
      ),
      images: Math.max(0, Number(result.images) || 0),
      videos: Math.max(0, Number(result.videos) || 0),
      selected: Math.max(0, Number(result.selected) || 0),
      selectedFolders: Math.max(0, Number(result.selectedFolders) || 0),
      videoDurationSeconds: Math.max(
        0,
        Math.round(Number(result.videoDurationSeconds) || 0),
      ),
      videoDurationUnavailable: Math.max(
        0,
        Math.round(Number(result.videoDurationUnavailable) || 0),
      ),
      videoDetails,
      videoDetailsTruncated: Boolean(result.videoDetailsTruncated),
    });
  } catch {
    return NextResponse.json(
      { error: "扫描服务暂时不可用，请稍后重试" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
