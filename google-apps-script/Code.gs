/**
 * Google Drive read-only scanner for 量见.
 * Deploy as a Web App that executes as the scanner account.
 * The scanner account must have Viewer access to submitted folders.
 */
function doPost(event) {
  try {
    var body = JSON.parse((event && event.postData && event.postData.contents) || "{}");
    var expectedSecret = PropertiesService
      .getScriptProperties()
      .getProperty("SCANNER_SECRET");
    if (
      !expectedSecret ||
      !secureEquals_(String(body.secret || ""), expectedSecret)
    ) {
      return json_({ ok: false, error: "扫描请求未授权" });
    }
    var folderId = extractFolderId_(String(body.url || ""));
    if (!folderId) return json_({ ok: false, error: "无效的 Google Drive 文件夹链接" });

    var folder = Drive.Files.get(folderId, {
      fields: "id,name,mimeType",
      supportsAllDrives: true
    });
    if (folder.mimeType !== "application/vnd.google-apps.folder") {
      return json_({ ok: false, error: "链接目标不是文件夹" });
    }

    var requestedLimits = body.limits || {};
    var limits = {
      maxDepth: Math.min(12, Math.max(1, Number(requestedLimits.maxDepth) || 12)),
      maxItems: Math.min(10000, Math.max(100, Number(requestedLimits.maxItems) || 10000))
    };
    var result = {
      images: 0,
      videos: 0,
      selected: 0,
      selectedFolders: 0,
      videoDurationSeconds: 0,
      videoDurationUnavailable: 0,
      videoDetails: [],
      videoDetailsTruncated: false,
      scannedItems: 0,
      limitReached: false
    };
    scanFolder_(folder.id, folder.name, false, result, 0, limits);
    if (result.limitReached) {
      return json_({
        ok: false,
        error: "文件夹层级或文件数量超过安全上限，请拆分后再检测"
      });
    }

    return json_({
      ok: true,
      folderName: folder.name,
      images: result.images,
      videos: result.videos,
      selected: result.selected,
      selectedFolders: result.selectedFolders,
      videoDurationSeconds: result.videoDurationSeconds,
      videoDurationUnavailable: result.videoDurationUnavailable,
      videoDetails: result.videoDetails,
      videoDetailsTruncated: result.videoDetailsTruncated,
      total: result.images + result.videos
    });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: "无法读取文件夹，请确认已共享给统计账号" });
  }
}

function extractFolderId_(url) {
  if (url.length > 500) return "";
  var match = url.match(/^https:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|open\?id=)([-\w]{10,})/i);
  return match ? match[1] : "";
}

function scanFolder_(folderId, folderName, insideSelected, result, depth, limits) {
  if (depth > limits.maxDepth || result.limitReached) {
    result.limitReached = true;
    return;
  }
  var folderMatches = isSelectedFolderName_(folderName);
  var selectedHere = insideSelected || folderMatches;
  if (folderMatches) result.selectedFolders += 1;

  var pageToken;
  do {
    var response = Drive.Files.list({
      q: "'" + folderId + "' in parents and trashed = false",
      pageSize: 1000,
      pageToken: pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: "nextPageToken,files(id,name,mimeType,videoMediaMetadata)"
    });
    var files = response.files || [];

    files.forEach(function(file) {
      if (result.limitReached) return;
      result.scannedItems += 1;
      if (result.scannedItems > limits.maxItems) {
        result.limitReached = true;
        return;
      }
      if (file.mimeType === "application/vnd.google-apps.folder") {
        scanFolder_(
          file.id,
          file.name,
          selectedHere,
          result,
          depth + 1,
          limits
        );
        return;
      }

      var isImage = file.mimeType.indexOf("image/") === 0;
      var isVideo = file.mimeType.indexOf("video/") === 0;
      if (!isImage && !isVideo) return;

      if (isImage) result.images += 1;
      if (selectedHere) result.selected += 1;

      if (isVideo) {
        result.videos += 1;
        var durationMillis =
          file.videoMediaMetadata && file.videoMediaMetadata.durationMillis;
        var durationSeconds =
          durationMillis == null
            ? null
            : Math.max(0, Math.round(Number(durationMillis) / 1000));
        if (durationSeconds == null || !isFinite(durationSeconds)) {
          durationSeconds = null;
          result.videoDurationUnavailable += 1;
        } else {
          result.videoDurationSeconds += durationSeconds;
        }
        if (result.videoDetails.length < 500) {
          result.videoDetails.push({
            name: file.name,
            durationSeconds: durationSeconds
          });
        } else {
          result.videoDetailsTruncated = true;
        }
      }
    });
    pageToken = response.nextPageToken;
  } while (pageToken && !result.limitReached);
}

function isSelectedFolderName_(name) {
  var normalized = String(name || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_\-—–·.。()（）\[\]【】]+/g, "");

  if (
    normalized === "已选用" ||
    normalized === "已经选用" ||
    normalized === "選用" ||
    normalized === "已選用" ||
    normalized === "已采用" ||
    normalized === "已经采用"
  ) {
    return true;
  }

  // 支持“已选用素材”“选用视频2”等写法，但明确不匹配“待选用”。
  return /^(?:已|已经)?(?:选用|選用)(?:文件|文件夹|素材|成品|成片|图片|视频)?(?:\d+|[一二三四五六七八九十]+)?$/.test(
    normalized
  );
}

function secureEquals_(left, right) {
  if (left.length !== right.length) return false;
  var difference = 0;
  for (var index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
