const path = require("node:path");
const { app, BrowserWindow, session, shell } = require("electron");

const PRODUCTION_URL =
  "https://liangjian-team-output.lumiimage.workers.dev";
const DEVELOPMENT_URL =
  !app.isPackaged && process.env.LIANGJIAN_APP_URL
    ? process.env.LIANGJIAN_APP_URL
    : PRODUCTION_URL;
const APP_USER_MODEL_ID = "com.squirrel.liangjian.LiangJian";

// Some employee PCs and virtualized Windows environments cannot initialize
// Chromium's GPU subprocess reliably. The dashboard does not need hardware
// acceleration, so keep rendering on the stable software path.
app.disableHardwareAcceleration();

function isTrustedNavigation(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.origin === new URL(DEVELOPMENT_URL).origin) {
      return true;
    }
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    return [
      "google.com",
      "gstatic.com",
      "googleusercontent.com",
    ].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

function openExternalSafely(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "https:") void shell.openExternal(url.toString());
  } catch {
    // Ignore malformed and non-HTTPS destinations.
  }
}

function createWindow() {
  const window = new BrowserWindow({
    title: "量见 · 团队产量台",
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: "#fff8ee",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      devTools: !app.isPackaged,
    },
  });

  window.once("ready-to-show", () => {
    if (process.env.LIANGJIAN_SMOKE_TEST === "1") {
      app.exit(0);
      return;
    }
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedNavigation(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          backgroundColor: "#fff8ee",
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            experimentalFeatures: false,
            webviewTag: false,
            devTools: !app.isPackaged,
          },
        },
      };
    }
    openExternalSafely(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedNavigation(url)) {
      event.preventDefault();
      openExternalSafely(url);
    }
  });

  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, _description, _url, isMainFrame) => {
      if (!isMainFrame || errorCode === -3 || window.isDestroyed()) return;
      void window.loadFile(path.join(__dirname, "offline.html"));
    },
  );

  void window.loadURL(DEVELOPMENT_URL);
}

app.setAppUserModelId(APP_USER_MODEL_ID);
app.enableSandbox();

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
