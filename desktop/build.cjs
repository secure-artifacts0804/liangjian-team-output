const { execFileSync } = require("node:child_process");
const {
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const path = require("node:path");
const { createPackage } = require("@electron/asar");
const {
  flipFuses,
  getCurrentFuseWire,
  FuseV1Options,
  FuseVersion,
} = require("@electron/fuses");

const FUSE_DISABLED = "0".charCodeAt(0);
const FUSE_ENABLED = "1".charCodeAt(0);

const desktopRoot = __dirname;
const packageJson = require("./package.json");
const outputRoot = path.join(desktopRoot, "out");
const appRoot = path.join(outputRoot, "LiangJian-win32-x64");
const resourcesRoot = path.join(appRoot, "resources");
const electronRoot = path.dirname(require("electron"));
const sourceRoot = path.join(outputRoot, "app-source");
const archivePath = path.join(resourcesRoot, "app.asar");
const executablePath = path.join(appRoot, "LiangJian.exe");
const zipPath = path.join(
  outputRoot,
  `LiangJian-v${packageJson.version}-windows-x64.zip`,
);

if (existsSync(outputRoot)) rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(sourceRoot, { recursive: true });
cpSync(electronRoot, appRoot, { recursive: true });

renameSync(path.join(appRoot, "electron.exe"), executablePath);
rmSync(path.join(resourcesRoot, "default_app.asar"), { force: true });

for (const filename of ["main.cjs", "offline.html"]) {
  cpSync(path.join(desktopRoot, filename), path.join(sourceRoot, filename));
}

writeFileSync(
  path.join(sourceRoot, "package.json"),
  `${JSON.stringify(
    {
      name: packageJson.name,
      productName: packageJson.productName,
      version: packageJson.version,
      description: packageJson.description,
      main: packageJson.main,
      private: true,
    },
    null,
    2,
  )}\n`,
);

async function build() {
  await createPackage(sourceRoot, archivePath);
  await flipFuses(executablePath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });

  const fuseWire = await getCurrentFuseWire(executablePath);
  const expectedFuses = new Map([
    [FuseV1Options.RunAsNode, FUSE_DISABLED],
    [FuseV1Options.EnableCookieEncryption, FUSE_ENABLED],
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FUSE_DISABLED],
    [FuseV1Options.EnableNodeCliInspectArguments, FUSE_DISABLED],
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FUSE_ENABLED],
    [FuseV1Options.OnlyLoadAppFromAsar, FUSE_ENABLED],
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, FUSE_ENABLED],
    [FuseV1Options.GrantFileProtocolExtraPrivileges, FUSE_DISABLED],
  ]);
  for (const [option, expected] of expectedFuses) {
    if (fuseWire[option] !== expected) {
      throw new Error(`Electron fuse ${option} was not applied correctly.`);
    }
  }

  rmSync(sourceRoot, { recursive: true, force: true });
  const sevenZip = "C:\\Program Files\\7-Zip\\7z.exe";
  if (!existsSync(sevenZip)) {
    throw new Error("7-Zip is required to create the release archive.");
  }
  execFileSync(
    sevenZip,
    ["a", "-tzip", "-mx=9", zipPath, path.join(appRoot, "*")],
    { stdio: "inherit" },
  );

  console.log(`Built ${zipPath}`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
