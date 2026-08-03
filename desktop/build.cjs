const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const path = require("node:path");
const { createPackage, getRawHeader } = require("@electron/asar");
const {
  flipFuses,
  getCurrentFuseWire,
  FuseV1Options,
  FuseVersion,
} = require("@electron/fuses");
const { Data, NtExecutable, NtExecutableResource, Resource } = require("resedit");

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
const iconPath = path.join(desktopRoot, "assets", "icon.ico");
const zipPath = path.join(
  outputRoot,
  `LiangJian-v${packageJson.version}-windows-x64.zip`,
);

function exactArrayBuffer(buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
}

function editWindowsResources(exePath, asarPath) {
  const executable = NtExecutable.from(readFileSync(exePath));
  const resources = NtExecutableResource.from(executable);

  const iconGroups = Resource.IconGroupEntry.fromEntries(resources.entries);
  if (iconGroups.length !== 1) {
    throw new Error("Unable to locate the Windows executable icon group.");
  }
  const iconFile = Data.IconFile.from(readFileSync(iconPath));
  Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    iconGroups[0].id,
    iconGroups[0].lang,
    iconFile.icons.map((item) => item.data),
  );

  const versionInfo = Resource.VersionInfo.fromEntries(resources.entries);
  if (versionInfo.length !== 1) {
    throw new Error("Unable to locate the Windows executable version resource.");
  }
  const languageInfo = versionInfo[0].getAllLanguagesForStringValues();
  if (languageInfo.length !== 1) {
    throw new Error("Unable to locate the Windows executable language resource.");
  }
  const versionParts = packageJson.version.split(".").map(Number);
  versionInfo[0].setFileVersion(...versionParts, 0);
  versionInfo[0].setProductVersion(...versionParts, 0);
  versionInfo[0].setStringValues(languageInfo[0], {
    CompanyName: packageJson.author,
    FileDescription: packageJson.description,
    InternalName: "LiangJian",
    OriginalFilename: "LiangJian.exe",
    ProductName: packageJson.productName,
  });
  versionInfo[0].outputToResourceEntries(resources.entries);

  const asarHeader = getRawHeader(asarPath).headerString;
  const headerHash = createHash("sha256").update(asarHeader).digest("hex");
  const integrityBuffer = Buffer.from(
    JSON.stringify([
      {
        file: "resources\\app.asar",
        alg: "sha256",
        value: headerHash,
      },
    ]),
    "utf8",
  );
  resources.entries.push({
    type: "INTEGRITY",
    id: "ELECTRONASAR",
    bin: exactArrayBuffer(integrityBuffer),
    lang: languageInfo[0].lang,
    codepage: languageInfo[0].codepage,
  });

  resources.outputResource(executable);
  writeFileSync(exePath, Buffer.from(executable.generate()));
  return headerHash;
}

function verifyAsarIntegrityResource(exePath, expectedHash) {
  const executable = NtExecutable.from(readFileSync(exePath));
  const resources = NtExecutableResource.from(executable);
  const matches = resources.entries.filter(
    (entry) => entry.type === "INTEGRITY" && entry.id === "ELECTRONASAR",
  );
  if (matches.length !== 1) {
    throw new Error("The packaged app is missing its ASAR integrity resource.");
  }
  const integrity = JSON.parse(Buffer.from(matches[0].bin).toString("utf8"));
  const expected = [
    {
      file: "resources\\app.asar",
      alg: "sha256",
      value: expectedHash,
    },
  ];
  if (JSON.stringify(integrity) !== JSON.stringify(expected)) {
    throw new Error("The packaged app contains an invalid ASAR integrity resource.");
  }
}

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
  const asarHeaderHash = editWindowsResources(executablePath, archivePath);
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
  verifyAsarIntegrityResource(executablePath, asarHeaderHash);

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
