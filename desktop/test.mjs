import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("./main.cjs", import.meta.url), "utf8");
const desktopPackage = JSON.parse(
  await readFile(new URL("./package.json", import.meta.url), "utf8"),
);
const rootPackage = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

test("desktop and release versions match", () => {
  assert.equal(desktopPackage.version, rootPackage.version);
});

test("remote content is isolated from Electron privileges", () => {
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /setWindowOpenHandler/);
  assert.doesNotMatch(main, /preload\s*:/);
});

test("packaged app uses the fixed HTTPS production endpoint", () => {
  assert.match(
    main,
    /https:\/\/liangjian-team-output\.workspace-538344\.chatgpt\.site/,
  );
  assert.match(main, /url\.protocol !== "https:"/);
});

test("packaged app exposes a CI-only startup smoke test", () => {
  assert.match(main, /LIANGJIAN_SMOKE_TEST === "1"/);
  assert.match(main, /app\.exit\(0\)/);
});

test("packaging enables ASAR and hardened Electron fuses", () => {
  return readFile(new URL("./build.cjs", import.meta.url), "utf8").then(
    (builder) => {
      assert.match(builder, /createPackage\(sourceRoot, archivePath\)/);
      assert.match(builder, /getRawHeader\(asarPath\)\.headerString/);
      assert.match(builder, /type: "INTEGRITY"/);
      assert.match(builder, /id: "ELECTRONASAR"/);
      assert.match(builder, /verifyAsarIntegrityResource/);
      assert.match(builder, /RunAsNode\]: false/);
      assert.match(builder, /EnableCookieEncryption\]: true/);
      assert.match(builder, /EnableNodeOptionsEnvironmentVariable\]: false/);
      assert.match(builder, /EnableNodeCliInspectArguments\]: false/);
      assert.match(builder, /EnableEmbeddedAsarIntegrityValidation\]: true/);
      assert.match(builder, /OnlyLoadAppFromAsar\]: true/);
      assert.match(builder, /strictlyRequireAllFuses: true/);
      assert.match(builder, /LoadBrowserProcessSpecificV8Snapshot\]: false/);
      assert.match(builder, /GrantFileProtocolExtraPrivileges\]: false/);
      assert.match(builder, /WasmTrapHandlers\]: true/);
    },
  );
});
