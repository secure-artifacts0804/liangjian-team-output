import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const env = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};
const context = {
  waitUntil() {},
  passThroughOnException() {},
};

test("server-renders the protected production dashboard shell", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    env,
    context,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>量见 · 团队产量台<\/title>/);
  assert.match(html, /正在打开团队产量台/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);

  const dashboardSource = await readFile(
    new URL("../app/Dashboard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dashboardSource, /已选用/);
  assert.match(dashboardSource, /中午/);
  assert.match(dashboardSource, /下午/);
  assert.match(dashboardSource, /晚上/);
  assert.match(dashboardSource, /人员定量看板/);
  assert.match(dashboardSource, /报数打卡/);
  assert.match(dashboardSource, /实际产量/);
  assert.match(dashboardSource, /组长 PIN/);
  assert.match(dashboardSource, /指定谁是组长/);
});

test("rejects non-Google Drive scan targets before contacting a backend", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/private" }),
    }),
    env,
    context,
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /Google Drive/);
});

test("recognizes selected-folder naming variants without matching pending folders", async () => {
  const scannerSource = await readFile(
    new URL("../google-apps-script/Code.gs", import.meta.url),
    "utf8",
  );
  const sandbox = {};
  vm.runInNewContext(scannerSource, sandbox);

  for (const name of [
    "已选用",
    "已经选用",
    "选用",
    " 已选用 ",
    "已选用-素材",
    "选用视频2",
    "已選用",
  ]) {
    assert.equal(sandbox.isSelectedFolderName_(name), true, name);
  }
  for (const name of ["待选用", "未选用", "选用说明", "备选素材"]) {
    assert.equal(sandbox.isSelectedFolderName_(name), false, name);
  }
});
