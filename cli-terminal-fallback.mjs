#!/usr/bin/env bun
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/is-docker/index.js
import fs from "node:fs";
function hasDockerEnv() {
  try {
    fs.statSync("/.dockerenv");
    return true;
  } catch {
    return false;
  }
}
function hasDockerCGroup() {
  try {
    return fs.readFileSync("/proc/self/cgroup", "utf8").includes("docker");
  } catch {
    return false;
  }
}
function isDocker() {
  if (isDockerCached === void 0) {
    isDockerCached = hasDockerEnv() || hasDockerCGroup();
  }
  return isDockerCached;
}
var isDockerCached;
var init_is_docker = __esm({
  "node_modules/is-docker/index.js"() {
  }
});

// node_modules/is-inside-container/index.js
import fs2 from "node:fs";
function isInsideContainer() {
  if (cachedResult === void 0) {
    cachedResult = hasContainerEnv() || isDocker();
  }
  return cachedResult;
}
var cachedResult, hasContainerEnv;
var init_is_inside_container = __esm({
  "node_modules/is-inside-container/index.js"() {
    init_is_docker();
    hasContainerEnv = () => {
      try {
        fs2.statSync("/run/.containerenv");
        return true;
      } catch {
        return false;
      }
    };
  }
});

// node_modules/is-wsl/index.js
import process2 from "node:process";
import os from "node:os";
import fs3 from "node:fs";
var isWsl, is_wsl_default;
var init_is_wsl = __esm({
  "node_modules/is-wsl/index.js"() {
    init_is_inside_container();
    isWsl = () => {
      if (process2.platform !== "linux") {
        return false;
      }
      if (os.release().toLowerCase().includes("microsoft")) {
        if (isInsideContainer()) {
          return false;
        }
        return true;
      }
      try {
        if (fs3.readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft")) {
          return !isInsideContainer();
        }
      } catch {
      }
      if (fs3.existsSync("/proc/sys/fs/binfmt_misc/WSLInterop") || fs3.existsSync("/run/WSL")) {
        return !isInsideContainer();
      }
      return false;
    };
    is_wsl_default = process2.env.__IS_WSL_TEST__ ? isWsl : isWsl();
  }
});

// node_modules/powershell-utils/index.js
import process3 from "node:process";
import { Buffer as Buffer2 } from "node:buffer";
import { promisify } from "node:util";
import childProcess from "node:child_process";
var execFile, powerShellPath, executePowerShell;
var init_powershell_utils = __esm({
  "node_modules/powershell-utils/index.js"() {
    execFile = promisify(childProcess.execFile);
    powerShellPath = () => `${process3.env.SYSTEMROOT || process3.env.windir || String.raw`C:\Windows`}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
    executePowerShell = async (command, options = {}) => {
      const {
        powerShellPath: psPath,
        ...execFileOptions
      } = options;
      const encodedCommand = executePowerShell.encodeCommand(command);
      return execFile(
        psPath ?? powerShellPath(),
        [
          ...executePowerShell.argumentsPrefix,
          encodedCommand
        ],
        {
          encoding: "utf8",
          ...execFileOptions
        }
      );
    };
    executePowerShell.argumentsPrefix = [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand"
    ];
    executePowerShell.encodeCommand = (command) => Buffer2.from(command, "utf16le").toString("base64");
    executePowerShell.escapeArgument = (value) => `'${String(value).replaceAll("'", "''")}'`;
  }
});

// node_modules/wsl-utils/utilities.js
function parseMountPointFromConfig(content) {
  for (const line of content.split("\n")) {
    if (/^\s*#/.test(line)) {
      continue;
    }
    const match = /^\s*root\s*=\s*(?<mountPoint>"[^"]*"|'[^']*'|[^#]*)/.exec(line);
    if (!match) {
      continue;
    }
    return match.groups.mountPoint.trim().replaceAll(/^["']|["']$/g, "");
  }
}
var init_utilities = __esm({
  "node_modules/wsl-utils/utilities.js"() {
  }
});

// node_modules/wsl-utils/index.js
import { promisify as promisify2 } from "node:util";
import childProcess2 from "node:child_process";
import fs4, { constants as fsConstants } from "node:fs/promises";
var execFile2, wslDrivesMountPoint, powerShellPathFromWsl, powerShellPath2, canAccessPowerShellPromise, canAccessPowerShell, wslDefaultBrowser, convertWslPathToWindows;
var init_wsl_utils = __esm({
  "node_modules/wsl-utils/index.js"() {
    init_is_wsl();
    init_powershell_utils();
    init_utilities();
    init_is_wsl();
    execFile2 = promisify2(childProcess2.execFile);
    wslDrivesMountPoint = /* @__PURE__ */ (() => {
      const defaultMountPoint = "/mnt/";
      let mountPoint;
      return async function() {
        if (mountPoint) {
          return mountPoint;
        }
        const configFilePath = "/etc/wsl.conf";
        let isConfigFileExists = false;
        try {
          await fs4.access(configFilePath, fsConstants.F_OK);
          isConfigFileExists = true;
        } catch {
        }
        if (!isConfigFileExists) {
          return defaultMountPoint;
        }
        const configContent = await fs4.readFile(configFilePath, { encoding: "utf8" });
        const parsedMountPoint = parseMountPointFromConfig(configContent);
        if (parsedMountPoint === void 0) {
          return defaultMountPoint;
        }
        mountPoint = parsedMountPoint;
        mountPoint = mountPoint.endsWith("/") ? mountPoint : `${mountPoint}/`;
        return mountPoint;
      };
    })();
    powerShellPathFromWsl = async () => {
      const mountPoint = await wslDrivesMountPoint();
      return `${mountPoint}c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`;
    };
    powerShellPath2 = is_wsl_default ? powerShellPathFromWsl : powerShellPath;
    canAccessPowerShell = async () => {
      canAccessPowerShellPromise ??= (async () => {
        try {
          const psPath = await powerShellPath2();
          await fs4.access(psPath, fsConstants.X_OK);
          return true;
        } catch {
          return false;
        }
      })();
      return canAccessPowerShellPromise;
    };
    wslDefaultBrowser = async () => {
      const psPath = await powerShellPath2();
      const command = String.raw`(Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice").ProgId`;
      const { stdout } = await executePowerShell(command, { powerShellPath: psPath });
      return stdout.trim();
    };
    convertWslPathToWindows = async (path3) => {
      if (/^[a-z]+:\/\//i.test(path3)) {
        return path3;
      }
      try {
        const { stdout } = await execFile2("wslpath", ["-aw", path3], { encoding: "utf8" });
        return stdout.trim();
      } catch {
        return path3;
      }
    };
  }
});

// node_modules/define-lazy-prop/index.js
function defineLazyProperty(object, propertyName, valueGetter) {
  const define = (value) => Object.defineProperty(object, propertyName, { value, enumerable: true, writable: true });
  Object.defineProperty(object, propertyName, {
    configurable: true,
    enumerable: true,
    get() {
      const result = valueGetter();
      define(result);
      return result;
    },
    set(value) {
      define(value);
    }
  });
  return object;
}
var init_define_lazy_prop = __esm({
  "node_modules/define-lazy-prop/index.js"() {
  }
});

// node_modules/default-browser-id/index.js
import { promisify as promisify3 } from "node:util";
import process4 from "node:process";
import { execFile as execFile3 } from "node:child_process";
async function defaultBrowserId() {
  if (process4.platform !== "darwin") {
    throw new Error("macOS only");
  }
  const { stdout } = await execFileAsync("defaults", ["read", "com.apple.LaunchServices/com.apple.launchservices.secure", "LSHandlers"]);
  const match = /LSHandlerRoleAll = "(?!-)(?<id>[^"]+?)";\s+?LSHandlerURLScheme = (?:http|https);/.exec(stdout);
  const browserId = match?.groups.id ?? "com.apple.Safari";
  if (browserId === "com.apple.safari") {
    return "com.apple.Safari";
  }
  return browserId;
}
var execFileAsync;
var init_default_browser_id = __esm({
  "node_modules/default-browser-id/index.js"() {
    execFileAsync = promisify3(execFile3);
  }
});

// node_modules/run-applescript/index.js
import process5 from "node:process";
import { promisify as promisify4 } from "node:util";
import { execFile as execFile4, execFileSync } from "node:child_process";
async function runAppleScript(script, { humanReadableOutput = true, signal } = {}) {
  if (process5.platform !== "darwin") {
    throw new Error("macOS only");
  }
  const outputArguments = humanReadableOutput ? [] : ["-ss"];
  const execOptions = {};
  if (signal) {
    execOptions.signal = signal;
  }
  const { stdout } = await execFileAsync2("osascript", ["-e", script, outputArguments], execOptions);
  return stdout.trim();
}
var execFileAsync2;
var init_run_applescript = __esm({
  "node_modules/run-applescript/index.js"() {
    execFileAsync2 = promisify4(execFile4);
  }
});

// node_modules/bundle-name/index.js
async function bundleName(bundleId) {
  return runAppleScript(`tell application "Finder" to set app_path to application file id "${bundleId}" as string
tell application "System Events" to get value of property list item "CFBundleName" of property list file (app_path & ":Contents:Info.plist")`);
}
var init_bundle_name = __esm({
  "node_modules/bundle-name/index.js"() {
    init_run_applescript();
  }
});

// node_modules/default-browser/windows.js
import { promisify as promisify5 } from "node:util";
import { execFile as execFile5 } from "node:child_process";
async function defaultBrowser(_execFileAsync = execFileAsync3) {
  const { stdout } = await _execFileAsync("reg", [
    "QUERY",
    " HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice",
    "/v",
    "ProgId"
  ]);
  const match = /ProgId\s*REG_SZ\s*(?<id>\S+)/.exec(stdout);
  if (!match) {
    throw new UnknownBrowserError(`Cannot find Windows browser in stdout: ${JSON.stringify(stdout)}`);
  }
  const { id } = match.groups;
  const dotIndex = id.lastIndexOf(".");
  const hyphenIndex = id.lastIndexOf("-");
  const baseIdByDot = dotIndex === -1 ? void 0 : id.slice(0, dotIndex);
  const baseIdByHyphen = hyphenIndex === -1 ? void 0 : id.slice(0, hyphenIndex);
  return windowsBrowserProgIds[id] ?? windowsBrowserProgIds[baseIdByDot] ?? windowsBrowserProgIds[baseIdByHyphen] ?? { name: id, id };
}
var execFileAsync3, windowsBrowserProgIds, _windowsBrowserProgIdMap, UnknownBrowserError;
var init_windows = __esm({
  "node_modules/default-browser/windows.js"() {
    execFileAsync3 = promisify5(execFile5);
    windowsBrowserProgIds = {
      MSEdgeHTM: { name: "Edge", id: "com.microsoft.edge" },
      // The missing `L` is correct.
      MSEdgeBHTML: { name: "Edge Beta", id: "com.microsoft.edge.beta" },
      MSEdgeDHTML: { name: "Edge Dev", id: "com.microsoft.edge.dev" },
      AppXq0fevzme2pys62n3e0fbqa7peapykr8v: { name: "Edge", id: "com.microsoft.edge.old" },
      ChromeHTML: { name: "Chrome", id: "com.google.chrome" },
      ChromeBHTML: { name: "Chrome Beta", id: "com.google.chrome.beta" },
      ChromeDHTML: { name: "Chrome Dev", id: "com.google.chrome.dev" },
      ChromiumHTM: { name: "Chromium", id: "org.chromium.Chromium" },
      BraveHTML: { name: "Brave", id: "com.brave.Browser" },
      BraveBHTML: { name: "Brave Beta", id: "com.brave.Browser.beta" },
      BraveDHTML: { name: "Brave Dev", id: "com.brave.Browser.dev" },
      BraveSSHTM: { name: "Brave Nightly", id: "com.brave.Browser.nightly" },
      FirefoxURL: { name: "Firefox", id: "org.mozilla.firefox" },
      OperaStable: { name: "Opera", id: "com.operasoftware.Opera" },
      VivaldiHTM: { name: "Vivaldi", id: "com.vivaldi.Vivaldi" },
      "IE.HTTP": { name: "Internet Explorer", id: "com.microsoft.ie" }
    };
    _windowsBrowserProgIdMap = new Map(Object.entries(windowsBrowserProgIds));
    UnknownBrowserError = class extends Error {
    };
  }
});

// node_modules/default-browser/index.js
import { promisify as promisify6 } from "node:util";
import process6 from "node:process";
import { execFile as execFile6 } from "node:child_process";
async function defaultBrowser2() {
  if (process6.platform === "darwin") {
    const id = await defaultBrowserId();
    const name = await bundleName(id);
    return { name, id };
  }
  if (process6.platform === "linux") {
    const { stdout } = await execFileAsync4("xdg-mime", ["query", "default", "x-scheme-handler/http"]);
    const id = stdout.trim();
    const name = titleize(id.replace(/.desktop$/, "").replace("-", " "));
    return { name, id };
  }
  if (process6.platform === "win32") {
    return defaultBrowser();
  }
  throw new Error("Only macOS, Linux, and Windows are supported");
}
var execFileAsync4, titleize;
var init_default_browser = __esm({
  "node_modules/default-browser/index.js"() {
    init_default_browser_id();
    init_bundle_name();
    init_windows();
    init_windows();
    execFileAsync4 = promisify6(execFile6);
    titleize = (string) => string.toLowerCase().replaceAll(/(?:^|\s|-)\S/g, (x) => x.toUpperCase());
  }
});

// node_modules/is-in-ssh/index.js
import process7 from "node:process";
var isInSsh, is_in_ssh_default;
var init_is_in_ssh = __esm({
  "node_modules/is-in-ssh/index.js"() {
    isInSsh = Boolean(process7.env.SSH_CONNECTION || process7.env.SSH_CLIENT || process7.env.SSH_TTY);
    is_in_ssh_default = isInSsh;
  }
});

// node_modules/open/index.js
var open_exports = {};
__export(open_exports, {
  apps: () => apps,
  default: () => open_default,
  openApp: () => openApp
});
import process8 from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import childProcess3 from "node:child_process";
import fs5, { constants as fsConstants2 } from "node:fs/promises";
function detectArchBinary(binary) {
  if (typeof binary === "string" || Array.isArray(binary)) {
    return binary;
  }
  const { [arch]: archBinary } = binary;
  if (!archBinary) {
    throw new Error(`${arch} is not supported`);
  }
  return archBinary;
}
function detectPlatformBinary({ [platform]: platformBinary }, { wsl } = {}) {
  if (wsl && is_wsl_default) {
    return detectArchBinary(wsl);
  }
  if (!platformBinary) {
    throw new Error(`${platform} is not supported`);
  }
  return detectArchBinary(platformBinary);
}
var fallbackAttemptSymbol, __dirname, localXdgOpenPath, platform, arch, tryEachApp, baseOpen, open, openApp, apps, open_default;
var init_open = __esm({
  "node_modules/open/index.js"() {
    init_wsl_utils();
    init_powershell_utils();
    init_define_lazy_prop();
    init_default_browser();
    init_is_inside_container();
    init_is_in_ssh();
    fallbackAttemptSymbol = /* @__PURE__ */ Symbol("fallbackAttempt");
    __dirname = import.meta.url ? path.dirname(fileURLToPath(import.meta.url)) : "";
    localXdgOpenPath = path.join(__dirname, "xdg-open");
    ({ platform, arch } = process8);
    tryEachApp = async (apps2, opener) => {
      if (apps2.length === 0) {
        return;
      }
      const errors = [];
      for (const app of apps2) {
        try {
          return await opener(app);
        } catch (error) {
          errors.push(error);
        }
      }
      throw new AggregateError(errors, "Failed to open in all supported apps");
    };
    baseOpen = async (options) => {
      options = {
        wait: false,
        background: false,
        newInstance: false,
        allowNonzeroExitCode: false,
        ...options
      };
      const isFallbackAttempt = options[fallbackAttemptSymbol] === true;
      delete options[fallbackAttemptSymbol];
      if (Array.isArray(options.app)) {
        return tryEachApp(options.app, (singleApp) => baseOpen({
          ...options,
          app: singleApp,
          [fallbackAttemptSymbol]: true
        }));
      }
      let { name: app, arguments: appArguments = [] } = options.app ?? {};
      appArguments = [...appArguments];
      if (Array.isArray(app)) {
        return tryEachApp(app, (appName) => baseOpen({
          ...options,
          app: {
            name: appName,
            arguments: appArguments
          },
          [fallbackAttemptSymbol]: true
        }));
      }
      if (app === "browser" || app === "browserPrivate") {
        const ids = {
          "com.google.chrome": "chrome",
          "google-chrome.desktop": "chrome",
          "com.brave.browser": "brave",
          "org.mozilla.firefox": "firefox",
          "firefox.desktop": "firefox",
          "com.microsoft.msedge": "edge",
          "com.microsoft.edge": "edge",
          "com.microsoft.edgemac": "edge",
          "microsoft-edge.desktop": "edge",
          "com.apple.safari": "safari"
        };
        const flags = {
          chrome: "--incognito",
          brave: "--incognito",
          firefox: "--private-window",
          edge: "--inPrivate"
          // Safari doesn't support private mode via command line
        };
        let browser;
        if (is_wsl_default) {
          const progId = await wslDefaultBrowser();
          const browserInfo = _windowsBrowserProgIdMap.get(progId);
          browser = browserInfo ?? {};
        } else {
          browser = await defaultBrowser2();
        }
        if (browser.id in ids) {
          const browserName = ids[browser.id.toLowerCase()];
          if (app === "browserPrivate") {
            if (browserName === "safari") {
              throw new Error("Safari doesn't support opening in private mode via command line");
            }
            appArguments.push(flags[browserName]);
          }
          return baseOpen({
            ...options,
            app: {
              name: apps[browserName],
              arguments: appArguments
            }
          });
        }
        throw new Error(`${browser.name} is not supported as a default browser`);
      }
      let command;
      const cliArguments = [];
      const childProcessOptions = {};
      let shouldUseWindowsInWsl = false;
      if (is_wsl_default && !isInsideContainer() && !is_in_ssh_default && !app) {
        shouldUseWindowsInWsl = await canAccessPowerShell();
      }
      if (platform === "darwin") {
        command = "open";
        if (options.wait) {
          cliArguments.push("--wait-apps");
        }
        if (options.background) {
          cliArguments.push("--background");
        }
        if (options.newInstance) {
          cliArguments.push("--new");
        }
        if (app) {
          cliArguments.push("-a", app);
        }
      } else if (platform === "win32" || shouldUseWindowsInWsl) {
        command = await powerShellPath2();
        cliArguments.push(...executePowerShell.argumentsPrefix);
        if (!is_wsl_default) {
          childProcessOptions.windowsVerbatimArguments = true;
        }
        if (is_wsl_default && options.target) {
          options.target = await convertWslPathToWindows(options.target);
        }
        const encodedArguments = ["$ProgressPreference = 'SilentlyContinue';", "Start"];
        if (options.wait) {
          encodedArguments.push("-Wait");
        }
        if (app) {
          encodedArguments.push(executePowerShell.escapeArgument(app));
          if (options.target) {
            appArguments.push(options.target);
          }
        } else if (options.target) {
          encodedArguments.push(executePowerShell.escapeArgument(options.target));
        }
        if (appArguments.length > 0) {
          appArguments = appArguments.map((argument) => executePowerShell.escapeArgument(argument));
          encodedArguments.push("-ArgumentList", appArguments.join(","));
        }
        options.target = executePowerShell.encodeCommand(encodedArguments.join(" "));
        if (!options.wait) {
          childProcessOptions.stdio = "ignore";
        }
      } else {
        if (app) {
          command = app;
        } else {
          const isBundled = !__dirname || __dirname === "/";
          let exeLocalXdgOpen = false;
          try {
            await fs5.access(localXdgOpenPath, fsConstants2.X_OK);
            exeLocalXdgOpen = true;
          } catch {
          }
          const useSystemXdgOpen = process8.versions.electron ?? (platform === "android" || isBundled || !exeLocalXdgOpen);
          command = useSystemXdgOpen ? "xdg-open" : localXdgOpenPath;
        }
        if (appArguments.length > 0) {
          cliArguments.push(...appArguments);
        }
        if (!options.wait) {
          childProcessOptions.stdio = "ignore";
          childProcessOptions.detached = true;
        }
      }
      if (platform === "darwin" && appArguments.length > 0) {
        cliArguments.push("--args", ...appArguments);
      }
      if (options.target) {
        cliArguments.push(options.target);
      }
      const subprocess = childProcess3.spawn(command, cliArguments, childProcessOptions);
      if (options.wait) {
        return new Promise((resolve, reject) => {
          subprocess.once("error", reject);
          subprocess.once("close", (exitCode) => {
            if (!options.allowNonzeroExitCode && exitCode !== 0) {
              reject(new Error(`Exited with code ${exitCode}`));
              return;
            }
            resolve(subprocess);
          });
        });
      }
      if (isFallbackAttempt) {
        return new Promise((resolve, reject) => {
          subprocess.once("error", reject);
          subprocess.once("spawn", () => {
            subprocess.once("close", (exitCode) => {
              subprocess.off("error", reject);
              if (exitCode !== 0) {
                reject(new Error(`Exited with code ${exitCode}`));
                return;
              }
              subprocess.unref();
              resolve(subprocess);
            });
          });
        });
      }
      subprocess.unref();
      return new Promise((resolve, reject) => {
        subprocess.once("error", reject);
        subprocess.once("spawn", () => {
          subprocess.off("error", reject);
          resolve(subprocess);
        });
      });
    };
    open = (target, options) => {
      if (typeof target !== "string") {
        throw new TypeError("Expected a `target`");
      }
      return baseOpen({
        ...options,
        target
      });
    };
    openApp = (name, options) => {
      if (typeof name !== "string" && !Array.isArray(name)) {
        throw new TypeError("Expected a valid `name`");
      }
      const { arguments: appArguments = [] } = options ?? {};
      if (appArguments !== void 0 && appArguments !== null && !Array.isArray(appArguments)) {
        throw new TypeError("Expected `appArguments` as Array type");
      }
      return baseOpen({
        ...options,
        app: {
          name,
          arguments: appArguments
        }
      });
    };
    apps = {
      browser: "browser",
      browserPrivate: "browserPrivate"
    };
    defineLazyProperty(apps, "chrome", () => detectPlatformBinary({
      darwin: "google chrome",
      win32: "chrome",
      // `chromium-browser` is the older deb package name used by Ubuntu/Debian before snap.
      linux: ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]
    }, {
      wsl: {
        ia32: "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        x64: ["/mnt/c/Program Files/Google/Chrome/Application/chrome.exe", "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"]
      }
    }));
    defineLazyProperty(apps, "brave", () => detectPlatformBinary({
      darwin: "brave browser",
      win32: "brave",
      linux: ["brave-browser", "brave"]
    }, {
      wsl: {
        ia32: "/mnt/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe",
        x64: ["/mnt/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe", "/mnt/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe"]
      }
    }));
    defineLazyProperty(apps, "firefox", () => detectPlatformBinary({
      darwin: "firefox",
      win32: String.raw`C:\Program Files\Mozilla Firefox\firefox.exe`,
      linux: "firefox"
    }, {
      wsl: "/mnt/c/Program Files/Mozilla Firefox/firefox.exe"
    }));
    defineLazyProperty(apps, "edge", () => detectPlatformBinary({
      darwin: "microsoft edge",
      win32: "msedge",
      linux: ["microsoft-edge", "microsoft-edge-dev"]
    }, {
      wsl: "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
    }));
    defineLazyProperty(apps, "safari", () => detectPlatformBinary({
      darwin: "Safari"
    }));
    open_default = open;
  }
});

// cli-terminal.tsx
import React, { useState, useEffect, useCallback } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import TextInput from "ink-text-input";
import Picture, { TerminalInfoProvider } from "ink-picture";
import { spawn, spawnSync, execSync } from "node:child_process";
import fs6 from "node:fs";
import path2 from "node:path";
import os2 from "node:os";
import http from "node:http";

// firebase-config.ts
var getFirebaseConfig = () => {
  return {
    apiKey: Buffer.from("QUl6YVN5QWZ3T19jLV9CYmtpSTBOY2lwVHZHSXlhX1IxRVl5eVRJ", "base64").toString("utf8"),
    authDomain: Buffer.from("bnlhbmltZS10ZWNoLmZpcmViYXNlYXBwLmNvbQ==", "base64").toString("utf8"),
    projectId: Buffer.from("bnlhbmltZS10ZWNo", "base64").toString("utf8"),
    storageBucket: Buffer.from("bnlhbmltZS10ZWNoLmZpcmViYXNlc3RvcmFnZS5hcHA=", "base64").toString("utf8"),
    messagingSenderId: Buffer.from("Njc3NDA3MTg0OTU1", "base64").toString("utf8"),
    appId: Buffer.from("MTo2Nzc0MDcxODQ5NTU6d2ViOmIzY2M1MDk1ZTgzOGM5MDE3ZTI0MWU=", "base64").toString("utf8"),
    measurementId: Buffer.from("Ry1FR0ZGRldUOERL", "base64").toString("utf8")
  };
};

// cli-terminal.tsx
var API_BASE = process.env.NYCLI_API_BASE || "http://localhost:43201";
var VERSION = "6.1.0";
var fbConfig = getFirebaseConfig();
var FIREBASE_PROJECT_ID = fbConfig.projectId;
var FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
var FIREBASE_API_KEY = fbConfig.apiKey;
var NYANIME_BASE = "https://www.nyanime.qzz.io";
process.stdout.write("\x1B[2J\x1B[0f");
var theme = {
  purple: "#8B5CF6",
  blue: "#0EA5E9",
  pink: "#D946EF",
  cyan: "#06B6D4",
  yellow: "#F59E0B",
  dimGray: "#6B7280",
  lightGray: "#9CA3AF",
  white: "#F9FAFB",
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  green: "#22C55E",
  red: "#EF4444"
};
var GRADIENT = [theme.purple, theme.blue, theme.pink];
var CONFIG_DIR = process.env.XDG_CONFIG_HOME ? path2.join(process.env.XDG_CONFIG_HOME, "ny-cli") : path2.join(os2.homedir(), ".config", "ny-cli");
var DATA_DIR = process.env.XDG_DATA_HOME ? path2.join(process.env.XDG_DATA_HOME, "ny-cli") : path2.join(os2.homedir(), ".local", "share", "ny-cli");
var AUTH_FILE = path2.join(CONFIG_DIR, "auth");
var HISTORY_FILE = path2.join(DATA_DIR, "history");
var SETTINGS_FILE = path2.join(CONFIG_DIR, "settings.json");
var ANIME4K_DIR = path2.join(DATA_DIR, "anime4k");
try {
  fs6.mkdirSync(CONFIG_DIR, { recursive: true });
  fs6.mkdirSync(DATA_DIR, { recursive: true });
  fs6.mkdirSync(ANIME4K_DIR, { recursive: true });
} catch {
}
var defaultSettings = {
  anime4k: false,
  anime4kMode: "A"
};
function loadSettings() {
  try {
    if (fs6.existsSync(SETTINGS_FILE)) {
      return { ...defaultSettings, ...JSON.parse(fs6.readFileSync(SETTINGS_FILE, "utf8")) };
    }
  } catch {
  }
  return defaultSettings;
}
function saveSettings(settings) {
  try {
    fs6.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch {
  }
}
function isAnime4kInstalled() {
  try {
    const shaderPath = path2.join(ANIME4K_DIR, "Anime4K_Clamp_Highlights.glsl");
    return fs6.existsSync(shaderPath);
  } catch {
    return false;
  }
}
function isLoggedIn() {
  try {
    return fs6.existsSync(AUTH_FILE) && fs6.statSync(AUTH_FILE).size > 0;
  } catch {
    return false;
  }
}
function getUsername() {
  try {
    if (!isLoggedIn()) return "";
    const content = fs6.readFileSync(AUTH_FILE, "utf8");
    return content.split("\n")[0] || "";
  } catch {
    return "";
  }
}
function getToken() {
  try {
    if (!isLoggedIn()) return "";
    const content = fs6.readFileSync(AUTH_FILE, "utf8");
    return content.split("\n")[1] || "";
  } catch {
    return "";
  }
}
function getIdToken() {
  try {
    if (!isLoggedIn()) return "";
    const content = fs6.readFileSync(AUTH_FILE, "utf8");
    return content.split("\n")[2] || "";
  } catch {
    return "";
  }
}
function getRefreshToken() {
  try {
    if (!isLoggedIn()) return "";
    const content = fs6.readFileSync(AUTH_FILE, "utf8");
    return content.split("\n")[3] || "";
  } catch {
    return "";
  }
}
function saveAuth(username, token, idToken, refreshToken) {
  try {
    const existingId = getIdToken();
    const existingRefresh = getRefreshToken();
    const finalIdToken = idToken || existingId;
    const finalRefreshToken = refreshToken || existingRefresh;
    fs6.writeFileSync(AUTH_FILE, `${username}
${token}
${finalIdToken}
${finalRefreshToken}`, { mode: 384 });
  } catch {
  }
}
function logout() {
  try {
    fs6.unlinkSync(AUTH_FILE);
  } catch {
  }
}
var WATCH_PROGRESS_FILE = path2.join(DATA_DIR, "progress");
function getHistory() {
  try {
    if (!fs6.existsSync(HISTORY_FILE)) return [];
    const content = fs6.readFileSync(HISTORY_FILE, "utf8");
    return content.split("\n").filter(Boolean).map((line) => {
      const parts = line.split("|");
      const [rawId, title, ep, ts, cat, watchTime, duration, totalEps] = parts;
      const id = rawId && /^\d+$/.test(rawId.trim()) ? `anilist::${rawId.trim()}` : rawId;
      return {
        id,
        title,
        episode: parseInt(ep) || 1,
        timestamp: parseInt(ts) || Date.now(),
        category: cat === "dub" ? "dub" : "sub",
        watchTime: parseInt(watchTime) || 0,
        duration: parseInt(duration) || 0,
        totalEpisodes: parseInt(totalEps) || 0
      };
    }).slice(0, 20);
  } catch {
    return [];
  }
}
function saveToHistory(entry) {
  try {
    const history = getHistory().filter((h) => h.id !== entry.id);
    const newHistory = [entry, ...history].slice(0, 50);
    const content = newHistory.map(
      (h) => `${h.id}|${h.title}|${h.episode}|${h.timestamp}|${h.category}|${h.watchTime || 0}|${h.duration || 0}|${h.totalEpisodes || 0}`
    ).join("\n");
    fs6.writeFileSync(HISTORY_FILE, content);
    syncToCloud(entry).catch(() => {
    });
  } catch {
  }
}
function getWatchProgress(animeId, episode) {
  try {
    if (!fs6.existsSync(WATCH_PROGRESS_FILE)) return null;
    const progress = JSON.parse(fs6.readFileSync(WATCH_PROGRESS_FILE, "utf8"));
    return progress[`${animeId}:${episode}`] || null;
  } catch {
    return null;
  }
}
function getWatchPercentage(watchTime, duration) {
  if (!duration || duration <= 0) return 0;
  return Math.min(100, watchTime / duration * 100);
}
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
async function isOnline() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3e3);
    const response = await fetch("https://www.google.com/generate_204", {
      method: "HEAD",
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}
async function verifyFirebaseUser(firebaseUid) {
  try {
    const response = await fetch(`${FIRESTORE_BASE}/users/${firebaseUid}?key=${FIREBASE_API_KEY}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    if (!response.ok) return { valid: false };
    const data = await response.json();
    if (data.fields) {
      const username = data.fields.username?.stringValue || data.fields.displayName?.stringValue || data.fields.email?.stringValue?.split("@")[0] || "User";
      const photoUrl = data.fields.photoURL?.stringValue || data.fields.photoUrl?.stringValue || data.fields.avatarUrl?.stringValue || data.fields.profilePicture?.stringValue;
      return { valid: true, username, photoUrl };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}
async function fetchCloudHistory() {
  const token = getToken();
  if (!token || !await isOnline()) return [];
  try {
    const response = await fetch(`${NYANIME_BASE}/api/cli/history`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Firebase-UID": token
      }
    });
    if (!response.ok) return [];
    const data = await response.json();
    if (!data.success || !data.history) return [];
    return data.history.map((item) => ({
      id: item.animeSlug || item.id,
      title: item.animeTitle || item.title,
      episode: item.episodeNum || item.episode || 1,
      timestamp: item.timestamp || Date.now(),
      category: item.category === "dub" ? "dub" : "sub",
      watchTime: item.watchTime || 0,
      duration: item.duration || 0,
      totalEpisodes: item.totalEpisodes || 0
    }));
  } catch {
    return [];
  }
}
async function syncToCloud(entry) {
  const token = getToken();
  if (!token || !isLoggedIn()) return false;
  try {
    const response = await fetch(`${NYANIME_BASE}/api/cli/history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Firebase-UID": token
      },
      body: JSON.stringify({
        animeSlug: entry.id,
        animeTitle: entry.title,
        episodeNum: entry.episode,
        category: entry.category,
        watchTime: entry.watchTime || 0,
        duration: entry.duration || 0,
        totalEpisodes: entry.totalEpisodes || 0
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}
async function mergeCloudHistory() {
  const token = getToken();
  if (!token) return { added: 0, message: "Not logged in" };
  if (!await isOnline()) {
    return { added: 0, message: "Offline - using local history" };
  }
  try {
    const cloudHistory = await fetchCloudHistory();
    if (cloudHistory.length === 0) {
      return { added: 0, message: "Cloud sync complete" };
    }
    const localHistory = getHistory();
    const localIds = new Set(localHistory.map((h) => h.id));
    const newEntries = cloudHistory.filter((h) => !localIds.has(h.id));
    if (newEntries.length > 0) {
      const merged = [...localHistory];
      for (const entry of newEntries) {
        merged.push(entry);
      }
      merged.sort((a, b) => b.timestamp - a.timestamp);
      const content = merged.slice(0, 50).map(
        (h) => `${h.id}|${h.title}|${h.episode}|${h.timestamp}|${h.category}|${h.watchTime || 0}|${h.duration || 0}|${h.totalEpisodes || 0}`
      ).join("\n");
      fs6.writeFileSync(HISTORY_FILE, content);
    }
    return { added: newEntries.length, message: `Synced ${newEntries.length} items from cloud` };
  } catch (error) {
    return { added: 0, message: "Cloud sync failed" };
  }
}
function blendHex(a, b, t) {
  const parse = (c) => [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16)
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const blue = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, blue].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
function gradientColor(index, total) {
  if (total <= 1) return GRADIENT[0];
  const t = index / (total - 1);
  const scaled = t * (GRADIENT.length - 1);
  const idx = Math.min(Math.floor(scaled), GRADIENT.length - 2);
  const local = scaled - idx;
  return blendHex(GRADIENT[idx], GRADIENT[idx + 1], local);
}
var BANNER = [
  "\u2588\u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2557   \u2588\u2588\u2557       \u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557     \u2588\u2588\u2557",
  "\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551\u255A\u2588\u2588\u2557 \u2588\u2588\u2554\u255D      \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551     \u2588\u2588\u2551",
  "\u2588\u2588\u2554\u2588\u2588\u2557 \u2588\u2588\u2551 \u255A\u2588\u2588\u2588\u2588\u2554\u255D \u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551     \u2588\u2588\u2551     \u2588\u2588\u2551",
  "\u2588\u2588\u2551\u255A\u2588\u2588\u2557\u2588\u2588\u2551  \u255A\u2588\u2588\u2554\u255D  \u255A\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551     \u2588\u2588\u2551     \u2588\u2588\u2551",
  "\u2588\u2588\u2551 \u255A\u2588\u2588\u2588\u2588\u2551   \u2588\u2588\u2551         \u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551",
  "\u255A\u2550\u255D  \u255A\u2550\u2550\u2550\u255D   \u255A\u2550\u255D          \u255A\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D"
];
function Banner({ phase }) {
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", alignItems: "center", marginBottom: 1 }, BANNER.map((line, i) => /* @__PURE__ */ React.createElement(Text, { key: i, color: gradientColor((i * 8 + phase) % 45, 45), bold: true }, line)), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, "\u27E8 Your Gateway to Anime Streaming \u27E9"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, "v", VERSION, " \u2022 nyanime.qzz.io"));
}
var SPINNER_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
function Spinner({ color = theme.purple, text = "" }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);
  return /* @__PURE__ */ React.createElement(Text, null, /* @__PURE__ */ React.createElement(Text, { color, bold: true }, SPINNER_FRAMES[frame]), text && /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, " ", text));
}
var EXIT_FRAMES = ["\u25DC ", " \u25DD", " \u25DE", "\u25DF ", "\u25DC "];
function ExitAnimation({ onDone }) {
  const [frame, setFrame] = useState(0);
  useInput(() => {
    onDone();
  });
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => {
        if (f + 1 >= EXIT_FRAMES.length) {
          clearInterval(timer);
          setTimeout(onDone, 100);
        }
        return Math.min(f + 1, EXIT_FRAMES.length - 1);
      });
    }, 120);
    return () => clearInterval(timer);
  }, [onDone]);
  return /* @__PURE__ */ React.createElement(Text, { color: theme.purple }, EXIT_FRAMES[frame], " Goodbye!");
}
function ShimmerText({ text, speed = 100 }) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setOffset((o) => (o + 1) % text.length), speed);
    return () => clearInterval(timer);
  }, [text.length, speed]);
  return /* @__PURE__ */ React.createElement(Text, null, text.split("").map((char, i) => /* @__PURE__ */ React.createElement(Text, { key: i, color: gradientColor((i + offset) % text.length, text.length) }, char)));
}
function BouncingDots({ color = theme.purple }) {
  const [phase, setPhase] = useState(0);
  const dots = ["\u2801", "\u2802", "\u2804", "\u2840", "\u2880", "\u2820", "\u2810", "\u2808"];
  useEffect(() => {
    const timer = setInterval(() => setPhase((p) => (p + 1) % dots.length), 100);
    return () => clearInterval(timer);
  }, []);
  return /* @__PURE__ */ React.createElement(Text, { color, bold: true }, dots[phase], " ", dots[(phase + 2) % dots.length], " ", dots[(phase + 4) % dots.length]);
}
function WaveText({ text, colors = GRADIENT, speed = 100 }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPhase((p) => (p + 1) % 100), speed);
    return () => clearInterval(timer);
  }, [speed]);
  const chars = text.split("");
  return /* @__PURE__ */ React.createElement(Text, null, chars.map((char, i) => {
    const colorIdx = (i + phase) % colors.length;
    return /* @__PURE__ */ React.createElement(Text, { key: i, color: colors[colorIdx], bold: true }, char);
  }));
}
function ScrollingWelcome({ text, onComplete }) {
  const termWidth = process.stdout.columns || 80;
  const [position, setPosition] = useState(0);
  const [done, setDone] = useState(false);
  const centerPos = Math.floor((termWidth - text.length) / 2);
  const maxPos = centerPos + 30;
  useEffect(() => {
    const timer = setInterval(() => {
      setPosition((p) => {
        const newPos = p + 1;
        if (newPos > maxPos) {
          clearInterval(timer);
          setDone(true);
          return maxPos;
        }
        return newPos;
      });
    }, 60);
    return () => clearInterval(timer);
  }, [maxPos]);
  useEffect(() => {
    if (done && onComplete) {
      const timeout = setTimeout(onComplete, 100);
      return () => clearTimeout(timeout);
    }
  }, [done, onComplete]);
  if (done) return null;
  const padding = Math.max(0, position);
  const isFading = position > centerPos;
  return /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, null, " ".repeat(padding)), /* @__PURE__ */ React.createElement(Text, { dimColor: isFading }, text.split("").map((char, i) => {
    const colorIdx = (i + Math.floor(position / 3)) % GRADIENT.length;
    return /* @__PURE__ */ React.createElement(Text, { key: i, color: GRADIENT[colorIdx], bold: true }, char);
  })));
}
var imageUrlCache = /* @__PURE__ */ new Map();
async function getAnimeImageUrl(title) {
  const cacheKey = title.toLowerCase().trim();
  if (imageUrlCache.has(cacheKey)) {
    return imageUrlCache.get(cacheKey) || null;
  }
  try {
    const searchQuery = encodeURIComponent(title.split(" ").slice(0, 3).join(" "));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4e3);
    const response = await fetch(
      `https://api.jikan.moe/v4/anime?q=${searchQuery}&order_by=members&sort=desc&limit=1&sfw=true`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (response.ok) {
      const data = await response.json();
      const anime = data?.data?.[0];
      const imageUrl = anime?.images?.jpg?.large_image_url || anime?.images?.jpg?.image_url;
      if (imageUrl) {
        imageUrlCache.set(cacheKey, imageUrl);
        return imageUrl;
      }
    }
  } catch {
  }
  return null;
}
function AnimeArtwork({ title, imageUrl, width = 25, height = 12 }) {
  const [loading, setLoading] = useState(!imageUrl);
  const [error, setError] = useState(false);
  const [imgPath, setImgPath] = useState(null);
  const prevImgRef = React.useRef(null);
  useEffect(() => {
    let active = true;
    async function loadArtwork(url) {
      try {
        setLoading(true);
        const tmpDir = os2.tmpdir();
        const tmpFile = path2.join(tmpDir, `ny-cli-art-${Date.now()}.jpg`);
        const res = await fetch(url);
        if (!res.ok) throw new Error("Fetch failed");
        const buffer = await res.arrayBuffer();
        fs6.writeFileSync(tmpFile, Buffer.from(buffer));
        if (active) {
          setImgPath(tmpFile);
          setError(false);
        }
        if (active) setLoading(false);
      } catch (err) {
        if (active) {
          setError(true);
          setLoading(false);
        }
      }
    }
    if (imageUrl) {
      prevImgRef.current = imageUrl;
      loadArtwork(imageUrl);
      return () => {
        active = false;
      };
    }
    if (!title) {
      setImgPath(null);
      setLoading(false);
      return;
    }
    if (!prevImgRef.current) {
      setLoading(true);
    }
    const timer = setTimeout(() => {
      getAnimeImageUrl(title).then((url) => {
        if (url && active) {
          prevImgRef.current = url;
          loadArtwork(url);
        } else if (active) {
          setLoading(false);
          setError(true);
        }
      }).catch(() => {
        if (active) {
          setLoading(false);
          setError(true);
        }
      });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [title, imageUrl]);
  if (!title && !imageUrl && !imgPath) {
    return /* @__PURE__ */ React.createElement(Box, { width, height, borderStyle: "round", borderColor: theme.dimGray, justifyContent: "center", alignItems: "center" }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "No Art"));
  }
  if (loading && !imgPath) {
    return /* @__PURE__ */ React.createElement(Box, { width, height, borderStyle: "round", borderColor: theme.purple, justifyContent: "center", alignItems: "center", flexDirection: "column" }, /* @__PURE__ */ React.createElement(BouncingDots, { color: theme.purple }), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, "Loading..."));
  }
  if (!imgPath && !loading || error) {
    return /* @__PURE__ */ React.createElement(Box, { width, height, borderStyle: "round", borderColor: theme.dimGray, justifyContent: "center", alignItems: "center" }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "[!] No art"));
  }
  return /* @__PURE__ */ React.createElement(Box, { width, height, borderStyle: "round", borderColor: theme.purple }, /* @__PURE__ */ React.createElement(Box, { width: Math.max(1, width - 2), height: Math.max(1, height - 2), overflow: "hidden" }, /* @__PURE__ */ React.createElement(Picture, { src: imgPath, width: Math.max(1, width - 2), height: Math.max(1, height - 2) })));
}
function SelectList({ items, onSelect, onBack, title, color = theme.purple, showBorder = true, showArtwork = false, showNumbers = true, enableSearch = false, onAction }) {
  const { stdout } = useStdout();
  const [termSize2, setTermSize] = useState({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
  useEffect(() => {
    const onResize = () => setTermSize({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [rippleIndex, setRippleIndex] = useState(-1);
  const [ripplePhase, setRipplePhase] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const filteredItems = enableSearch && searchQuery ? items.filter((item) => {
    const num = item.number?.toString() || "";
    const label = item.label.toLowerCase();
    const query = searchQuery.toLowerCase();
    return num.startsWith(query) || label.includes(query);
  }) : items;
  const maxVisible = Math.min(10, filteredItems.length);
  const startIdx = Math.max(0, Math.min(selectedIndex - Math.floor(maxVisible / 2), filteredItems.length - maxVisible));
  const visibleItems = filteredItems.slice(startIdx, startIdx + maxVisible);
  const selectedItem = filteredItems[selectedIndex];
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);
  useEffect(() => {
    if (rippleIndex >= 0) {
      const timer = setInterval(() => {
        setRipplePhase((p) => {
          if (p >= 5) {
            clearInterval(timer);
            setRippleIndex(-1);
            return 0;
          }
          return p + 1;
        });
      }, 60);
      return () => clearInterval(timer);
    }
  }, [rippleIndex]);
  useInput((input, key) => {
    if (enableSearch && input === "/" && !isSearching) {
      setIsSearching(true);
      return;
    }
    if (isSearching) {
      if (key.escape) {
        setIsSearching(false);
        setSearchQuery("");
      } else if (key.return) {
        setIsSearching(false);
      } else if (key.backspace || key.delete) {
        setSearchQuery((q) => q.slice(0, -1));
      } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setSearchQuery((q) => q + input);
      }
      return;
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(filteredItems.length - 1, i + 1));
    } else if (key.return) {
      if (filteredItems.length > 0) {
        setRippleIndex(selectedIndex);
        setRipplePhase(0);
        setTimeout(() => {
          onSelect(filteredItems[selectedIndex], selectedIndex);
        }, 300);
      }
    } else if (input === "q") {
      setIsExiting(true);
    } else if (key.escape || input === "b" || key.leftArrow) {
      if (searchQuery) {
        setSearchQuery("");
      } else if (onBack) {
        onBack();
      }
    } else if (onAction && (input === "d" || input === "a")) {
      if (filteredItems.length > 0) {
        onAction(input, filteredItems[selectedIndex]);
      }
    } else if (enableSearch && /^[0-9]$/.test(input)) {
      setSearchQuery((q) => q + input);
    } else if (showNumbers && /^[1-9]$/.test(input) && !enableSearch) {
      const num = parseInt(input, 10) - 1 + startIdx;
      if (num < filteredItems.length) {
        setSelectedIndex(num);
        setRippleIndex(num);
        setRipplePhase(0);
        setTimeout(() => {
          onSelect(filteredItems[num], num);
        }, 300);
      }
    }
  });
  const rippleChars = ["\u25CB", "\u25CE", "\u25CF", "\u25C9", "\u25CE", "\u25CB"];
  const getRippleChar = (phase) => rippleChars[Math.min(phase, rippleChars.length - 1)];
  const termWidth = process.stdout.columns || 80;
  const maxLabelLen = Math.max(30, termWidth - 25);
  const content = /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, title && /* @__PURE__ */ React.createElement(Text, { color, bold: true }, title), title && /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, "\u2191\u2193: navigate \u2502 Enter: select \u2502 b: back", enableSearch ? " \u2502 Type number to jump" : "", onAction ? " \u2502 d: dl \u2502 a: dl all" : "", " \u2502 q: quit"), enableSearch && /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "[S] "), /* @__PURE__ */ React.createElement(Text, { color: searchQuery ? theme.white : theme.dimGray }, searchQuery || "Type episode number..."), searchQuery && /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, " (", filteredItems.length, " matches)")), /* @__PURE__ */ React.createElement(Box, { marginTop: title ? 1 : 0, flexDirection: "column" }, visibleItems.map((item, idx) => {
    const actualIdx = startIdx + idx;
    const isSelected = actualIdx === selectedIndex;
    const isRippling = actualIdx === rippleIndex;
    const rippleColor = isRippling ? blendHex(theme.purple, theme.pink, ripplePhase / 5) : color;
    const indicator = isRippling ? getRippleChar(ripplePhase) : isSelected ? "\u25B8" : " ";
    const displayNum = idx + 1;
    const icon = item.icon ? `${item.icon} ` : "";
    const badgeStr = item.badge ? ` (${item.badge})` : "";
    const fullText = `${icon}${item.label}${badgeStr}`;
    const labelText = fullText.length > maxLabelLen ? fullText.slice(0, maxLabelLen - 3) + "..." : fullText;
    const numPrefix = showNumbers ? `${String(displayNum).padStart(2, " ")}) ` : "";
    return /* @__PURE__ */ React.createElement(Box, { key: actualIdx }, /* @__PURE__ */ React.createElement(Text, { color: isRippling ? rippleColor : isSelected ? color : theme.dimGray }, indicator), showNumbers && /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, numPrefix), !showNumbers && /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: isSelected ? theme.white : theme.lightGray, bold: isSelected }, labelText));
  })), items.length > maxVisible && /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, "\u2500\u2500\u2500\u2500 ", selectedIndex + 1, "/", items.length, " \u2500\u2500\u2500\u2500")));
  if (showArtwork) {
    const artworkWidth = 30;
    const artworkHeight = 15;
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: termSize2.cols < 70 ? "column" : "row" }, /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginRight: 2, width: artworkWidth }, /* @__PURE__ */ React.createElement(
      AnimeArtwork,
      {
        title: selectedItem?.label || "",
        imageUrl: selectedItem?.imageUrl,
        width: artworkWidth,
        height: artworkHeight
      }
    ), selectedItem && /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.cyan, wrap: "truncate-end" }, selectedItem.label.slice(0, artworkWidth - 2)))), showBorder ? /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", borderStyle: "round", borderColor: color, paddingX: 1, paddingY: 1, flexGrow: 1 }, content) : /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", flexGrow: 1 }, content));
  }
  if (showBorder) {
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", borderStyle: "round", borderColor: color, paddingX: 1, paddingY: 1 }, content);
  }
  return content;
}
function InputBox({ label, onSubmit, onCancel, placeholder = "", color = theme.purple }) {
  const [value, setValue] = useState("");
  useInput((input, key) => {
    if (key.escape && onCancel) {
      onCancel();
    }
  });
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, label && /* @__PURE__ */ React.createElement(Text, { color: theme.pink, bold: true }, label), /* @__PURE__ */ React.createElement(Box, { marginTop: 1, borderStyle: "round", borderColor: color, paddingX: 1 }, /* @__PURE__ */ React.createElement(Text, { color }, "\u276F "), /* @__PURE__ */ React.createElement(
    TextInput,
    {
      value,
      onChange: setValue,
      onSubmit: (v) => v.trim() && onSubmit(v.trim()),
      placeholder
    }
  )), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, "Enter: confirm \u2502 Escape: cancel"));
}
function StatusBar({ message, type = "info", loading = false }) {
  const [pulsePhase, setPulsePhase] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPulsePhase((p) => (p + 1) % 20), 150);
    return () => clearInterval(timer);
  }, []);
  const colors = {
    info: theme.blue,
    success: theme.success,
    warning: theme.warning,
    error: theme.error
  };
  const icons = {
    info: "[i]",
    success: "[+]",
    warning: "[!]",
    error: "[x]"
  };
  const baseBorderColor = type === "success" ? theme.success : type === "error" ? theme.error : type === "warning" ? theme.warning : theme.dimGray;
  const brightness = Math.sin(pulsePhase * 0.3) * 0.2 + 0.8;
  const borderColor = blendHex(baseBorderColor, theme.dimGray, 1 - brightness);
  return /* @__PURE__ */ React.createElement(Box, { borderStyle: "single", borderColor, paddingX: 1 }, loading ? /* @__PURE__ */ React.createElement(Spinner, { color: colors[type], text: message }) : /* @__PURE__ */ React.createElement(Text, null, /* @__PURE__ */ React.createElement(Text, { color: colors[type], bold: true }, icons[type]), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, " ", message)));
}
async function getJson(path3) {
  const res = await fetch(`${API_BASE}${path3}`);
  const text = await res.text();
  const body = JSON.parse(text);
  if (!res.ok || !body?.success) {
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  return body.data;
}
function SettingsScreen({ settings, onUpdate, onBack }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState("");
  const anime4kInstalled = isAnime4kInstalled();
  const modes = ["A", "B", "C", "A+A", "B+B", "C+A"];
  const menuItems = [
    { key: "anime4k", label: "Anime4K Upscaling", type: "toggle" },
    { key: "anime4kMode", label: "Anime4K Mode", type: "select" },
    { key: "download", label: "Download Anime4K Shaders", type: "action" },
    { key: "back", label: "\u2190 Back", type: "action" }
  ];
  const downloadAnime4k = async () => {
    setDownloading(true);
    setDownloadStatus("Downloading Anime4K shaders...");
    try {
      const targetDir = ANIME4K_DIR;
      const version = "v4.0.1";
      const url = `https://github.com/bloc97/Anime4K/releases/download/${version}/Anime4K_v4.0.zip`;
      const zipPath = path2.join(targetDir, "Anime4K.zip");
      setDownloadStatus("Downloading shaders...");
      execSync(`curl -sL "${url}" -o "${zipPath}"`, { stdio: "pipe" });
      setDownloadStatus("Extracting shaders...");
      execSync(`cd "${targetDir}" && unzip -o Anime4K.zip && mv Anime4K_v4.0/* . 2>/dev/null || true`, { stdio: "pipe" });
      execSync(`rm -f "${zipPath}" && rm -rf "${targetDir}/Anime4K_v4.0"`, { stdio: "pipe" });
      setDownloadStatus("\u2713 Anime4K shaders installed successfully!");
      setTimeout(() => setDownloadStatus(""), 3e3);
    } catch (err) {
      setDownloadStatus(`\u2717 Download failed: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };
  useInput((input, key) => {
    if (key.escape || input === "b" && selectedIndex !== 0) {
      onBack();
      return;
    }
    if (input === "q") {
      setIsExiting(true);
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(menuItems.length - 1, i + 1));
    } else if (key.return) {
      const item = menuItems[selectedIndex];
      if (item.key === "anime4k") {
        if (anime4kInstalled) {
          onUpdate({ ...settings, anime4k: !settings.anime4k });
        }
      } else if (item.key === "anime4kMode") {
        const currentIdx = modes.indexOf(settings.anime4kMode);
        const nextIdx = (currentIdx + 1) % modes.length;
        onUpdate({ ...settings, anime4kMode: modes[nextIdx] });
      } else if (item.key === "download") {
        if (!downloading) {
          downloadAnime4k();
        }
      } else if (item.key === "back") {
        onBack();
      }
    } else if (key.leftArrow && menuItems[selectedIndex].key === "anime4kMode") {
      const currentIdx = modes.indexOf(settings.anime4kMode);
      const prevIdx = currentIdx > 0 ? currentIdx - 1 : modes.length - 1;
      onUpdate({ ...settings, anime4kMode: modes[prevIdx] });
    } else if (key.rightArrow && menuItems[selectedIndex].key === "anime4kMode") {
      const currentIdx = modes.indexOf(settings.anime4kMode);
      const nextIdx = (currentIdx + 1) % modes.length;
      onUpdate({ ...settings, anime4kMode: modes[nextIdx] });
    }
  });
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", width: Math.min(60, termSize.cols - 4) }, /* @__PURE__ */ React.createElement(Box, { borderStyle: "round", borderColor: theme.cyan, paddingX: 2, paddingY: 1, flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.cyan, bold: true }, "[\u2699] Settings"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(50)), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 0 ? theme.cyan : theme.lightGray }, selectedIndex === 0 ? "\u25B8 " : "  ", "Anime4K Upscaling:", " "), anime4kInstalled ? /* @__PURE__ */ React.createElement(Text, { color: settings.anime4k ? theme.green : theme.red }, settings.anime4k ? "[ON]" : "[OFF]") : /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "[Not Installed]")), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 1 ? theme.cyan : theme.lightGray }, selectedIndex === 1 ? "\u25B8 " : "  ", "Anime4K Mode:", " "), /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 1 ? theme.cyan : theme.lightGray }, "\u25C0 ", settings.anime4kMode, " \u25B6")), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 2 ? theme.cyan : theme.lightGray }, selectedIndex === 2 ? "\u25B8 " : "  ", anime4kInstalled ? "\u21BB Re-download" : "\u2193 Download", " Anime4K Shaders")), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 3 ? theme.cyan : theme.lightGray }, selectedIndex === 3 ? "\u25B8 " : "  ", "\u2190 Back")), downloadStatus && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: downloadStatus.startsWith("\u2713") ? theme.green : downloadStatus.startsWith("\u2717") ? theme.red : theme.cyan }, downloadStatus))), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, anime4kInstalled ? "Anime4K shaders enhance video quality for older anime" : "Download shaders first to enable upscaling")), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "Mode A: Best for 1080p | Mode B: Soft edges | Mode C: Denoise")));
}
var rawArgs = process.argv.slice(2);
var enableAllanime = rawArgs.includes("--enable-allanime");
var initialQuery = rawArgs.filter((arg) => arg !== "--enable-allanime").join(" ").trim();
function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [termSize2, setTermSize] = useState({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
  useEffect(() => {
    const onResize = () => setTermSize({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);
  const [screen, setScreen] = useState(initialQuery ? "search" : "main-menu");
  const [animes, setAnimes] = useState([]);
  const [selectedAnime, setSelectedAnime] = useState(null);
  const [animeInfo, setAnimeInfo] = useState(null);
  const [audioType, setAudioType] = useState("sub");
  const [episodes, setEpisodes] = useState([]);
  const [autoAdvanceData, setAutoAdvanceData] = useState(null);
  const [appSettings, setAppSettings] = useState(loadSettings());
  const [history, setHistory] = useState(getHistory());
  const [downloadQueue, setDownloadQueue] = useState([]);
  const [status, setStatus] = useState({
    message: "Welcome to NY-CLI!",
    type: "info",
    loading: false
  });
  const [bannerPhase, setBannerPhase] = useState(0);
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [username, setUsername] = useState(getUsername());
  const [pendingUsername, setPendingUsername] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [autoPlayEpisode, setAutoPlayEpisode] = useState(null);
  const [showWelcome, setShowWelcome] = useState(!initialQuery);
  const [isExiting, setIsExiting2] = useState(false);
  const [userPhotoUrl, setUserPhotoUrl] = useState(null);
  const [playingEpisode, setPlayingEpisode] = useState(null);
  const [playingPaused, setPlayingPaused] = useState(false);
  const [playingProviders, setPlayingProviders] = useState([]);
  const [playingProviderIndex, setPlayingProviderIndex] = useState(0);
  const togglePause = () => {
    if (os2.platform() === "win32") return;
    if (playingPaused) {
      spawnSync("killall", ["-CONT", "mpv"]);
      setPlayingPaused(false);
    } else {
      spawnSync("killall", ["-STOP", "mpv"]);
      setPlayingPaused(true);
    }
  };
  const playProvider = (provider) => {
    if (provider.type === "torrent") {
      setStatus({ message: `Starting ${provider.name}...`, type: "success", loading: false });
      const wtCmd = os2.platform() === "win32" ? "npx.cmd" : "npx";
      spawn(wtCmd, ["-y", "webtorrent-cli", provider.magnet, "--mpv"], { stdio: "ignore", detached: true }).unref();
    } else if (provider.type === "direct") {
      setStatus({ message: `Starting ${provider.name} in MPV...`, type: "success", loading: false });
      const headerArgs = [];
      if (provider.headers) {
        Object.entries(provider.headers).forEach(([k, v]) => {
          headerArgs.push(`--http-header-fields-append=${k}: ${v}`);
        });
      }
      spawn("mpv", [provider.url, ...headerArgs, "--force-media-title=NY-CLI Stream"], { stdio: "ignore", detached: true }).unref();
    } else {
      spawn("mpv", [provider.url, "--force-media-title=NY-CLI Stream"], { stdio: "ignore", detached: true }).unref();
      setStatus({ message: `Opened stream in player.`, type: "success", loading: false });
    }
  };
  useEffect(() => {
    const timer = setInterval(() => {
      setBannerPhase((p) => (p + 1) % 50);
    }, 120);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (initialQuery) {
      handleSearch(initialQuery);
    }
  }, []);
  useEffect(() => {
    if (screen === "profile" && loggedIn && !userPhotoUrl) {
      const token = getToken();
      if (token) {
        verifyFirebaseUser(token).then((result) => {
          if (result.photoUrl) {
            setUserPhotoUrl(result.photoUrl);
          }
        }).catch(() => {
        });
      }
    }
  }, [screen, loggedIn, userPhotoUrl]);
  const loggedInMenuItems = [
    { value: "profile", label: "Profile", icon: "[P]" },
    { value: "continue", label: "Continue Watching", icon: "[>]" },
    { value: "search", label: "Search", icon: "[S]" },
    { value: "random", label: "Random Anime", icon: "[\u{1F3B2}]" },
    { value: "settings", label: "Settings", icon: "[\u2699]" },
    { value: "help", label: "Help", icon: "[?]" },
    { value: "exit", label: "Exit", icon: "[X]" }
  ];
  const loggedOutMenuItems = [
    { value: "search", label: "Search", icon: "[S]" },
    { value: "random", label: "Random Anime", icon: "[\u{1F3B2}]" },
    { value: "settings", label: "Settings", icon: "[\u2699]" },
    { value: "login", label: "Login", icon: "[L]" },
    { value: "help", label: "Help", icon: "[?]" },
    { value: "exit", label: "Exit", icon: "[X]" }
  ];
  const handleMenuSelect = useCallback((item) => {
    const action = item.value;
    if (action === "exit") {
      setIsExiting2(true);
    } else if (action === "search") {
      setScreen("search");
      setStatus({ message: "Enter anime name to search", type: "info", loading: false });
    } else if (action === "random") {
      handleRandomAnime();
    } else if (action === "continue") {
      handleContinue();
    } else if (action === "login") {
      handleStartLogin();
    } else if (action === "profile") {
      setScreen("login-token");
    } else if (screen === "login-token" || screen === "login-waiting") {
      setScreen("main-menu");
    } else if (action === "settings") {
      setScreen("settings");
    } else if (action === "help") {
      setScreen("help");
    }
  }, []);
  const handleSearch = useCallback(async (query) => {
    setStatus({ message: `Searching "${query}"...`, type: "info", loading: true });
    try {
      const data = await getJson(`/api/aniwatch?action=search&q=${encodeURIComponent(query)}&page=1`);
      const results = (data?.animes || []).slice(0, 20);
      if (!results.length) {
        setStatus({ message: "No anime found. Try different keywords.", type: "warning", loading: false });
        return;
      }
      setAnimes(results);
      setScreen("anime-select");
      setStatus({ message: `Found ${results.length} anime`, type: "success", loading: false });
    } catch (err) {
      setStatus({ message: `Search failed: ${err.message}`, type: "error", loading: false });
    }
  }, []);
  const handleRandomAnime = useCallback(async () => {
    setStatus({ message: "Finding random anime...", type: "info", loading: true });
    try {
      const data = await getJson("/api/aniwatch?action=random");
      const randomAnime = data?.randomAnime;
      if (!randomAnime) {
        setStatus({ message: "Could not find random anime", type: "warning", loading: false });
        return;
      }
      setStatus({ message: `Playing ${randomAnime.name}...`, type: "info", loading: true });
      const info = await getJson(`/api/aniwatch?action=info&id=${encodeURIComponent(randomAnime.id)}`);
      const eps = info?.episodes?.sub || info?.episodes?.dub || [];
      if (eps.length === 0) {
        setStatus({ message: "No episodes found", type: "warning", loading: false });
        return;
      }
      setSelectedAnime({
        id: randomAnime.id,
        value: randomAnime.id,
        label: randomAnime.name,
        poster: randomAnime.poster
      });
      setAnimeInfo(info);
      setAudioType(info?.episodes?.sub?.length ? "sub" : "dub");
      setEpisodes(eps);
      const firstEp = eps[0];
      setAutoPlayEpisode({ episodeId: firstEp.episodeId, number: 1 });
      setScreen("episode-select");
      setStatus({ message: `Starting ${randomAnime.name} Episode 1...`, type: "success", loading: true });
    } catch (err) {
      setStatus({ message: `Failed: ${err.message}`, type: "error", loading: false });
    }
  }, []);
  const handleContinue = useCallback(() => {
    const hist = getHistory();
    setHistory(hist);
    if (hist.length === 0) {
      setStatus({ message: "No watch history yet", type: "info", loading: false });
      return;
    }
    setScreen("continue");
    setStatus({ message: `${hist.length} anime in history`, type: "success", loading: false });
  }, []);
  const handleStartLogin = useCallback(() => {
    setStatus({ message: "Opening browser for login...", type: "info", loading: true });
    setScreen("login-waiting");
    const server = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "OPTIONS, POST");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method === "POST" && req.url === "/callback") {
        setStatus({ message: "Received callback connection...", type: "info", loading: true });
        let body = "";
        req.on("data", (chunk) => body += chunk.toString());
        req.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (data.token && data.username) {
              setStatus({ message: "Callback verified, logging in...", type: "info", loading: true });
              setPendingUsername(data.username);
              handleLoginToken(data.token, data.username, data.idToken, data.refreshToken);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true }));
            } else {
              res.writeHead(400);
              res.end();
            }
          } catch (e) {
            res.writeHead(400);
            res.end();
          } finally {
            server.close();
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(4e3, () => {
      Promise.resolve().then(() => (init_open(), open_exports)).then((open2) => {
        open2.default(`${API_BASE}/api/auth/login?port=4000`).catch(() => {
        });
      }).catch((err) => {
        setStatus({ message: "Failed to open browser: " + err.message, type: "error", loading: false });
      });
    });
    setTimeout(() => {
      server.close();
      if (!isLoggedIn()) {
        setStatus({ message: "Login timed out", type: "error", loading: false });
        setScreen("main-menu");
      }
    }, 5 * 60 * 1e3);
  }, []);
  const handleLoginToken = useCallback(async (firebaseUid, providedUsername, idToken, refreshToken) => {
    if (!firebaseUid.trim()) {
      setStatus({ message: "User ID cannot be empty", type: "error", loading: false });
      return;
    }
    setStatus({ message: "Verifying account...", type: "info", loading: true });
    try {
      const result = await verifyFirebaseUser(firebaseUid.trim());
      if (result.valid) {
        const finalUsername = result.username || providedUsername || pendingUsername;
        saveAuth(finalUsername, firebaseUid.trim(), idToken, refreshToken);
        setLoggedIn(true);
        setUsername(finalUsername);
        setStatus({ message: `Welcome, ${finalUsername}!`, type: "success", loading: false });
        if (result.photoUrl) {
          setUserPhotoUrl(result.photoUrl);
        }
        setSyncMessage("Syncing with cloud...");
        mergeCloudHistory().then(({ message }) => {
          setSyncMessage(message);
          setHistory(getHistory());
          setTimeout(() => setSyncMessage(""), 3e3);
        });
        setScreen("main-menu");
      } else {
        const fallbackUser = providedUsername || pendingUsername;
        saveAuth(fallbackUser, firebaseUid.trim());
        setLoggedIn(true);
        setUsername(fallbackUser);
        setScreen("main-menu");
        setStatus({ message: `Logged in as ${fallbackUser} (unverified)`, type: "warning", loading: false });
      }
    } catch (err) {
      const fallbackUser = providedUsername || pendingUsername;
      saveAuth(fallbackUser, firebaseUid.trim());
      setLoggedIn(true);
      setUsername(fallbackUser);
      setScreen("main-menu");
      setStatus({ message: "Logged in (offline mode)", type: "warning", loading: false });
    }
  }, [pendingUsername]);
  const handleLogout = useCallback(() => {
    logout();
    setLoggedIn(false);
    setUsername("");
    setPendingUsername("");
    setUserPhotoUrl(null);
    setScreen("main-menu");
    setStatus({ message: "Logged out. See you soon!", type: "info", loading: false });
  }, []);
  const goBack = useCallback(() => {
    if (screen === "episode-select") {
      setScreen("audio-select");
      setStatus({ message: "Select audio type", type: "info", loading: false });
    } else if (screen === "audio-select") {
      setScreen("anime-select");
      setStatus({ message: `Found ${animes.length} anime`, type: "success", loading: false });
    } else if (screen === "login-token") {
      setScreen("login");
      setPendingUsername("");
      setStatus({ message: "Enter your NyAnime username", type: "info", loading: false });
    } else if (["anime-select", "continue", "search", "profile", "login", "settings", "help", "downloading"].includes(screen)) {
      setScreen("main-menu");
      setStatus({ message: "Welcome to NY-CLI!", type: "info", loading: false });
    }
  }, [screen, animes.length]);
  const handleEpisodeAction = useCallback((action, item) => {
    if (action === "d" || action === "a") {
      const itemsToDownload = action === "a" ? episodes.map((e) => ({
        ...e,
        label: `Episode ${e.number}`,
        value: `ep-${e.number}`,
        episodeId: e.episodeId
      })) : [item];
      const anilistId = animeInfo?.id?.replace("anilist::", "") || "";
      const newTasks = itemsToDownload.map((ep) => ({
        id: ep.episodeId,
        anilistId,
        animeTitle: selectedAnime?.label || animeInfo?.name || "Anime",
        episodeNumber: ep.number || ep.epNo || 1,
        status: "pending",
        progress: 0,
        message: "Waiting..."
      }));
      setDownloadQueue((prev) => [...prev, ...newTasks]);
      setScreen("downloading");
    }
  }, [episodes, selectedAnime, animeInfo]);
  const handleAnimeSelect = useCallback(async (item) => {
    setStatus({ message: `Loading "${item.label}"...`, type: "info", loading: true });
    try {
      const data = await getJson(`/api/aniwatch?action=info&id=${encodeURIComponent(item.id)}`);
      const subCount = data?.episodes?.sub?.length || 0;
      const dubCount = data?.episodes?.dub?.length || 0;
      if (subCount === 0 && dubCount === 0) {
        setStatus({ message: "No episodes found", type: "warning", loading: false });
        return;
      }
      setSelectedAnime(item);
      setAnimeInfo(data);
      setScreen("audio-select");
      setStatus({ message: `Sub: ${subCount} eps \u2502 Dub: ${dubCount} eps`, type: "success", loading: false });
    } catch (err) {
      setStatus({ message: `Failed to load: ${err.message}`, type: "error", loading: false });
    }
  }, []);
  const handleAudioSelect = useCallback((item) => {
    const type = item.value;
    setAudioType(type);
    const eps = animeInfo?.episodes?.[type] || [];
    if (!eps.length) {
      setStatus({ message: `No ${type === "sub" ? "subbed" : "dubbed"} episodes`, type: "warning", loading: false });
      return;
    }
    setEpisodes(eps);
    setScreen("episode-select");
    setStatus({ message: `${eps.length} ${type === "sub" ? "subbed" : "dubbed"} episodes`, type: "success", loading: false });
  }, [animeInfo]);
  const handleHistorySelect = useCallback(async (item) => {
    setStatus({ message: `Loading "${item.label}"...`, type: "info", loading: true });
    try {
      const data = await getJson(`/api/aniwatch?action=info&id=${encodeURIComponent(item.id)}`);
      setSelectedAnime(item);
      setAnimeInfo(data);
      const histEntry = history.find((h) => h.id === item.id);
      const type = histEntry?.category || "sub";
      setAudioType(type);
      const eps = data?.episodes?.[type] || [];
      setEpisodes(eps);
      let targetEpisode = histEntry?.episode || 1;
      const progress = getWatchProgress(item.id, targetEpisode);
      const watchPercentage = progress ? getWatchPercentage(progress.watchTime, progress.duration) : 0;
      if (watchPercentage >= 90 && targetEpisode < eps.length) {
        const nextEp = eps.find((e) => e.number === targetEpisode + 1);
        const currEp = eps.find((e) => e.number === targetEpisode);
        if (nextEp && currEp) {
          setAutoAdvanceData({
            currentEpisode: currEp,
            nextEpisode: nextEp,
            percentage: watchPercentage
          });
          setScreen("auto-advance");
          setStatus({ message: `Episode ${targetEpisode} is almost complete.`, type: "info", loading: false });
          return;
        }
      }
      setScreen("episode-select");
      if (watchPercentage > 0 && watchPercentage < 97) {
        setStatus({ message: `Continue Episode ${targetEpisode} from ${formatTime(progress?.watchTime || 0)}`, type: "success", loading: false });
      } else {
        setStatus({ message: `${eps.length} episodes available`, type: "success", loading: false });
      }
    } catch (err) {
      setStatus({ message: `Failed: ${err.message}`, type: "error", loading: false });
    }
  }, [history]);
  const handleEpisodeSelect = useCallback(async (item, startPosition) => {
    setStatus({ message: `Getting stream for Episode ${item.number}...`, type: "info", loading: true });
    try {
      const animeTitle = selectedAnime?.label || animeInfo?.name || "";
      const animeJName = animeInfo?.jname || "";
      const totalEps = episodes.length || 0;
      const epNo = item.number || 1;
      const mode = audioType === "dub" ? "dub" : "sub";
      const epIdParts = String(item.episodeId || "").split("::");
      const malId = epIdParts[0] === "ep" ? Number(epIdParts[1]) : void 0;
      const anilistId = animeInfo?.id?.replace("anilist::", "") || "";
      setStatus({ message: `Resolving fastest available stream...`, type: "info", loading: true });
      const [torrentResult, backendResult] = await Promise.allSettled([
        getJson(`/api/torrent?title=${encodeURIComponent(animeTitle)}&ep=${epNo}`),
        getJson(`/api/resolve-stream?title=${encodeURIComponent(animeTitle)}&epNo=${epNo}&mode=${mode}${malId ? `&malId=${malId}` : ""}${enableAllanime ? "&enableAllanime=true" : ""}`)
      ]);
      const torrentData = torrentResult.status === "fulfilled" ? torrentResult.value : null;
      const backendStream = backendResult.status === "fulfilled" ? backendResult.value : null;
      let isTorrent = false;
      let magnetLink = "";
      let source = null;
      let streamHeaders = {};
      let isLocalStream = false;
      let allEmbedSources = [];
      const providers = [];
      if (backendStream && backendStream.url) {
        providers.push({ name: backendStream.quality || backendStream.provider || "Direct Stream", type: "direct", url: backendStream.url, headers: backendStream.referer ? { Referer: backendStream.referer, Origin: new URL(backendStream.referer).origin } : void 0 });
      }
      if (providers.length === 0 && torrentData?.magnet) {
        setStatus({ message: `No direct stream found \u2014 falling back to torrent (this will be slower)`, type: "info", loading: true });
        providers.push({ name: "Nyaa (Torrent)", type: "torrent", magnet: torrentData.magnet });
      }
      if (providers.length === 0) {
        setStatus({ message: "No playable source found", type: "error", loading: false });
        return;
      }
      setPlayingProviders(providers);
      setPlayingProviderIndex(0);
      setPlayingEpisode(item);
      setPlayingPaused(false);
      setScreen("playing");
      playProvider(providers[0]);
      const epAnimeTitle = selectedAnime?.label || animeInfo?.name || animeInfo?.title || "";
      const animeId = selectedAnime?.id || "";
      const episodeNum = item.number || 1;
      if (animeId && epAnimeTitle) {
        saveToHistory({ id: animeId, title: epAnimeTitle, episode: episodeNum, timestamp: Date.now(), category: audioType, totalEpisodes: totalEps });
      }
    } catch (err) {
      setStatus({ message: `Stream error: ${err.message}`, type: "error", loading: false });
    }
  }, [selectedAnime, animeInfo, audioType, episodes.length]);
  useEffect(() => {
    if (autoPlayEpisode && screen === "episode-select") {
      const timer = setTimeout(() => {
        handleEpisodeSelect({
          id: selectedAnime?.id,
          label: `Episode ${autoPlayEpisode.number}`,
          value: `ep-${autoPlayEpisode.number}`,
          episodeId: autoPlayEpisode.episodeId,
          number: autoPlayEpisode.number
        }, 0);
        setAutoPlayEpisode(null);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [autoPlayEpisode, screen, selectedAnime, handleEpisodeSelect]);
  useEffect(() => {
    if (downloadQueue.some((t) => t.status === "downloading")) return;
    const nextTaskIndex = downloadQueue.findIndex((t) => t.status === "pending");
    if (nextTaskIndex === -1) return;
    const task = downloadQueue[nextTaskIndex];
    setDownloadQueue((prev) => {
      const q = [...prev];
      q[nextTaskIndex].status = "downloading";
      q[nextTaskIndex].message = "Resolving stream...";
      return q;
    });
    const startDownload = async () => {
      try {
        const epIdParts = String(task.id || "").split("::");
        const malId = epIdParts[0] === "ep" ? Number(epIdParts[1]) : void 0;
        const safeTitle = task.animeTitle.replace(/[^a-zA-Z0-9]/g, "_");
        const outDir = path2.join(os2.homedir(), "Downloads", "ny-cli", safeTitle);
        const anilistQuery = task.anilistId ? `&anilistId=${task.anilistId}` : "";
        const [torrentResult, backendResult] = await Promise.allSettled([
          getJson(`/api/torrent?title=${encodeURIComponent(task.animeTitle)}&ep=${task.episodeNumber}`),
          getJson(`/api/resolve-stream?title=${encodeURIComponent(task.animeTitle)}&epNo=${task.episodeNumber}&mode=${audioType}${malId ? `&malId=${malId}` : ""}${enableAllanime ? "&enableAllanime=true" : ""}`)
        ]);
        const torrentData = torrentResult.status === "fulfilled" ? torrentResult.value : null;
        const backendStream = backendResult.status === "fulfilled" ? backendResult.value : null;
        let isTorrent = false;
        let magnetLink = "";
        if (torrentData?.magnet) {
          magnetLink = torrentData.magnet;
          isTorrent = true;
        }
        if (isTorrent && magnetLink) {
          if (!fs6.existsSync(outDir)) fs6.mkdirSync(outDir, { recursive: true });
          setDownloadQueue((prev) => {
            const q = [...prev];
            q[nextTaskIndex].message = "Downloading Torrent...";
            return q;
          });
          const wtCmd = os2.platform() === "win32" ? "npx.cmd" : "npx";
          const args2 = ["-y", "webtorrent-cli", "download", magnetLink, "-o", outDir];
          const wtProcess = spawn(wtCmd, args2);
          wtProcess.stdout.on("data", (data) => {
            const output = data.toString();
            const progressMatch = output.match(/(\d+(?:\.\d+)?)%/);
            if (progressMatch) {
              const progress = Math.min(100, Math.floor(parseFloat(progressMatch[1])));
              let msg = "Downloading Torrent...";
              const speedMatch = output.match(/([0-9.]+ [KMG]B\/s)/);
              if (speedMatch) msg = `Speed: ${speedMatch[1]}`;
              setDownloadQueue((prev) => {
                const q = [...prev];
                q[nextTaskIndex].progress = progress;
                q[nextTaskIndex].message = msg;
                return q;
              });
            }
          });
          wtProcess.on("close", (code) => {
            setDownloadQueue((prev) => {
              const q = [...prev];
              q[nextTaskIndex].status = code === 0 ? "completed" : "error";
              q[nextTaskIndex].message = code === 0 ? "Completed" : "WebTorrent Error";
              if (code === 0) q[nextTaskIndex].progress = 100;
              return q;
            });
          });
          return;
        }
        let streamUrl = "";
        let streamHeaders = {};
        if (backendStream?.url) {
          streamUrl = backendStream.url;
          if (backendStream.referer) {
            streamHeaders = { Referer: backendStream.referer, Origin: new URL(backendStream.referer).origin };
          }
        }
        if (!streamUrl) {
          throw new Error("No stream found");
        }
        if (!fs6.existsSync(outDir)) fs6.mkdirSync(outDir, { recursive: true });
        const filename = path2.join(outDir, `${safeTitle}_Ep${task.episodeNumber}.mp4`);
        setDownloadQueue((prev) => {
          const q = [...prev];
          q[nextTaskIndex].message = "Downloading Embed...";
          return q;
        });
        const args = ["-y"];
        if (streamHeaders && streamHeaders.Referer) {
          args.push("-headers", `Referer: ${streamHeaders.Referer}\r
`);
        }
        args.push(
          "-i",
          streamUrl,
          "-c",
          "copy",
          "-bsf:a",
          "aac_adtstoasc",
          "-progress",
          "pipe:1",
          "-nostats",
          filename
        );
        const ffmpeg = spawn("ffmpeg", args);
        let durationUs = 0;
        ffmpeg.stderr.on("data", (data) => {
          const output = data.toString();
          if (!durationUs) {
            const durMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
            if (durMatch) {
              const h = parseInt(durMatch[1]);
              const m = parseInt(durMatch[2]);
              const s = parseInt(durMatch[3]);
              durationUs = (h * 3600 + m * 60 + s) * 1e6;
            }
          }
        });
        ffmpeg.stdout.on("data", (data) => {
          const output = data.toString();
          const timeMatch = output.match(/out_time_us=(\d+)/);
          if (timeMatch && durationUs > 0) {
            const timeUs = parseInt(timeMatch[1]);
            const progress = Math.min(100, Math.max(0, Math.floor(timeUs / durationUs * 100)));
            setDownloadQueue((prev) => {
              const q = [...prev];
              q[nextTaskIndex].progress = progress;
              return q;
            });
          }
        });
        ffmpeg.on("close", (code) => {
          setDownloadQueue((prev) => {
            const q = [...prev];
            q[nextTaskIndex].status = code === 0 ? "completed" : "error";
            q[nextTaskIndex].message = code === 0 ? "Completed" : "FFmpeg Error";
            if (code === 0) q[nextTaskIndex].progress = 100;
            return q;
          });
        });
      } catch (err) {
        setDownloadQueue((prev) => {
          const q = [...prev];
          q[nextTaskIndex].status = "error";
          q[nextTaskIndex].message = err.message;
          return q;
        });
      }
    };
    startDownload();
  }, [downloadQueue, audioType]);
  const animeItems = animes.map((a) => ({
    id: a.id,
    label: a.name || a.title || "Untitled",
    badge: a.episodes ? `sub ${a.episodes.sub || 0} / dub ${a.episodes.dub || 0}` : void 0,
    imageUrl: a.poster || void 0
  }));
  const audioOptions = [
    {
      value: "sub",
      label: "Japanese (Subbed)",
      badge: `${animeInfo?.episodes?.sub?.length || 0} episodes`
    },
    {
      value: "dub",
      label: "English (Dubbed)",
      badge: `${animeInfo?.episodes?.dub?.length || 0} episodes`
    }
  ].filter((opt) => {
    const count = opt.value === "sub" ? animeInfo?.episodes?.sub?.length : animeInfo?.episodes?.dub?.length;
    return count > 0;
  });
  const episodeItems = episodes.map((e, idx) => ({
    episodeId: e.episodeId,
    // Use original index + 1 as episode number if number is missing/0
    number: e.number || idx + 1,
    title: e.title
  })).filter((ep, idx, arr) => arr.findIndex((e) => e.number === ep.number) === idx).sort((a, b) => a.number - b.number).map((e) => ({
    episodeId: e.episodeId,
    number: e.number,
    label: `Episode ${e.number}${e.title && !e.title.includes("Episode") ? `: ${e.title}` : ""}`
  }));
  const historyItems = history.filter((h) => {
    if (!h || !h.id || !h.title) return false;
    if (String(h.id).includes("undefined") || String(h.title).includes("undefined")) return false;
    if (h.title.trim() === "" || h.id.trim() === "") return false;
    return true;
  }).map((h) => {
    const progress = getWatchProgress(h.id, h.episode);
    const percentage = progress ? Math.round(getWatchPercentage(progress.watchTime, progress.duration)) : 0;
    const almostDone = percentage >= 97;
    const progressStr = percentage > 0 ? almostDone ? " - Almost done!" : ` \u2022 ${percentage}%` : "";
    return {
      id: h.id,
      value: h.id,
      label: h.title,
      badge: `Ep ${h.episode} \u2022 ${h.category.toUpperCase()}${progressStr}`,
      icon: almostDone ? "[*]" : void 0
    };
  });
  const profileMenuItems = [
    { value: "sync", label: "Sync History", icon: "[~]" },
    { value: "logout", label: "Logout", icon: "[X]" },
    { value: "back", label: "Back to Menu", icon: "[<]" }
  ];
  const handleProfileAction = useCallback(async (item) => {
    if (item.value === "logout") {
      handleLogout();
    } else if (item.value === "sync") {
      setStatus({ message: "Syncing with cloud...", type: "info", loading: true });
      const result = await mergeCloudHistory();
      setHistory(getHistory());
      setStatus({ message: result.message, type: result.added > 0 ? "success" : "info", loading: false });
    } else {
      goBack();
    }
  }, [handleLogout, goBack]);
  if (isExiting) {
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", padding: 1, alignItems: "center" }, /* @__PURE__ */ React.createElement(Banner, { phase: bannerPhase }), /* @__PURE__ */ React.createElement(Box, { marginTop: 2, justifyContent: "center" }, /* @__PURE__ */ React.createElement(ExitAnimation, { onDone: () => process.exit(0) })));
  }
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", padding: 1, alignItems: "center" }, /* @__PURE__ */ React.createElement(Banner, { phase: bannerPhase }), showWelcome && screen === "main-menu" && /* @__PURE__ */ React.createElement(Box, { marginBottom: 1, justifyContent: "center", width: "100%" }, /* @__PURE__ */ React.createElement(
    ScrollingWelcome,
    {
      text: "~ Youkoso! Welcome to NyAnime CLI! ~",
      onComplete: () => setShowWelcome(false)
    }
  )), screen === "playing" && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", alignItems: "center", marginTop: 1 }, /* @__PURE__ */ React.createElement(Box, { borderStyle: "round", borderColor: theme.cyan, padding: 1, flexDirection: "column", alignItems: "center" }, /* @__PURE__ */ React.createElement(Text, { color: theme.yellow, bold: true }, "Now Playing"), /* @__PURE__ */ React.createElement(Text, { color: theme.white }, selectedAnime?.label), /* @__PURE__ */ React.createElement(Text, { color: theme.white }, "Episode ", playingEpisode?.number), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "Provider: ", playingProviders[playingProviderIndex]?.name)), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: [
        { label: playingPaused ? "\u25B6 Resume Player" : "\u23F8 Pause Player", value: "pause" },
        { label: "\u23ED Next Episode", value: "next" },
        { label: "\u23EE Previous Episode", value: "prev" },
        { label: "\u2B07 Download Episode", value: "download" },
        { label: "\u2699 Switch Provider", value: "provider" },
        { label: "\u21A9 Back to Episodes", value: "back" }
      ],
      onSelect: (i) => {
        if (i.value === "pause") {
          togglePause();
        } else if (i.value === "back") {
          spawnSync("killall", ["-9", "mpv", "webtorrent-cli"]);
          setScreen("episode-select");
        } else if (i.value === "next") {
          spawnSync("killall", ["-9", "mpv", "webtorrent-cli"]);
          const nextEp = episodes.find((e) => e.number === (playingEpisode?.number || 0) + 1);
          if (nextEp) handleEpisodeSelect(nextEp);
        } else if (i.value === "prev") {
          spawnSync("killall", ["-9", "mpv", "webtorrent-cli"]);
          const prevEp = episodes.find((e) => e.number === (playingEpisode?.number || 0) - 1);
          if (prevEp) handleEpisodeSelect(prevEp);
        } else if (i.value === "download") {
          if (playingEpisode) handleEpisodeAction("d", playingEpisode);
          setStatus({ message: "Added to download queue!", type: "success" });
        } else if (i.value === "provider") {
          spawnSync("killall", ["-9", "mpv", "webtorrent-cli"]);
          const nextIndex = (playingProviderIndex + 1) % playingProviders.length;
          setPlayingProviderIndex(nextIndex);
          playProvider(playingProviders[nextIndex]);
        }
      },
      color: theme.pink
    }
  ))), screen === "main-menu" && !showWelcome && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", width: Math.min(55, termSize2.cols - 4), alignItems: "center" }, loggedIn ? /* @__PURE__ */ React.createElement(Box, { marginBottom: 1, borderStyle: "round", borderColor: theme.purple, paddingX: 2, paddingY: 0, width: Math.min(55, termSize2.cols - 4) }, /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "Okaeri, "), /* @__PURE__ */ React.createElement(ShimmerText, { text: username, speed: 150 }), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "!")) : /* @__PURE__ */ React.createElement(Box, { marginBottom: 1, borderStyle: "round", borderColor: theme.purple, paddingX: 2, paddingY: 0, width: Math.min(55, termSize2.cols - 4) }, /* @__PURE__ */ React.createElement(WaveText, { text: "Irasshaimase! Sign in for all features", colors: [theme.purple, theme.blue, theme.pink, theme.cyan], speed: 150 })), /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: loggedIn ? loggedInMenuItems : loggedOutMenuItems,
      onSelect: handleMenuSelect,
      color: theme.cyan,
      showBorder: true
    }
  )), screen === "search" && /* @__PURE__ */ React.createElement(
    InputBox,
    {
      label: "[S] Search Anime",
      onSubmit: handleSearch,
      onCancel: goBack,
      placeholder: "Type anime name...",
      color: theme.purple
    }
  ), screen === "anime-select" && /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: animeItems,
      onSelect: handleAnimeSelect,
      onBack: goBack,
      title: "[>] Select Anime",
      color: theme.purple,
      showArtwork: true
    }
  ), screen === "continue" && /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: historyItems,
      onSelect: handleHistorySelect,
      onBack: goBack,
      title: "[>] Continue Watching",
      color: theme.success,
      showArtwork: true
    }
  ), screen === "audio-select" && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.pink, bold: true }, "\u{1F4FA} ", selectedAnime?.label || "Anime"), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: audioOptions,
      onSelect: handleAudioSelect,
      onBack: goBack,
      title: "\u{1F50A} Select Audio Type",
      color: theme.cyan
    }
  ))), screen === "episode-select" && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.pink, bold: true }, "\u{1F4FA} ", selectedAnime?.label || "Anime", " ", /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "(", audioType.toUpperCase(), ")")), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: episodeItems,
      onSelect: handleEpisodeSelect,
      onAction: handleEpisodeAction,
      onBack: goBack,
      title: `\u{1F4CB} Select Episode (${episodeItems.length} total)`,
      color: theme.blue,
      showNumbers: false,
      enableSearch: episodeItems.length > 20
    }
  ))), screen === "downloading" && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", paddingX: 2, paddingY: 1, borderStyle: "round", borderColor: theme.cyan, width: Math.min(70, termSize2.cols - 4) }, /* @__PURE__ */ React.createElement(Text, { color: theme.pink, bold: true }, "\u{1F4E5} Downloads"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(60)), downloadQueue.length === 0 ? /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "Queue is empty.") : downloadQueue.map((t, idx) => {
    const pBar = "\u2588".repeat(Math.floor(t.progress / 5)) + "\u2591".repeat(20 - Math.floor(t.progress / 5));
    let statusColor = theme.lightGray;
    let icon = "\u23F3";
    if (t.status === "downloading") {
      statusColor = theme.cyan;
      icon = "\u2B07\uFE0F ";
    } else if (t.status === "completed") {
      statusColor = theme.green;
      icon = "\u2705";
    } else if (t.status === "error") {
      statusColor = theme.red;
      icon = "\u274C";
    }
    return /* @__PURE__ */ React.createElement(Box, { key: idx, flexDirection: "column", marginBottom: 1 }, /* @__PURE__ */ React.createElement(Text, { color: statusColor, bold: true }, icon, " ", t.animeTitle, " - Ep ", t.episodeNumber, " ", /* @__PURE__ */ React.createElement(Text, { dimColor: true }, "(", t.progress, "%)")), /* @__PURE__ */ React.createElement(Text, { color: theme.purple }, pBar, " ", /* @__PURE__ */ React.createElement(Text, { dimColor: true }, t.message)));
  }), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(60)), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "Press 'b' to go back")), screen === "auto-advance" && autoAdvanceData && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.pink, bold: true }, "\u{1F4FA} ", selectedAnime?.label || "Anime", " ", /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "(", audioType.toUpperCase(), ")")), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: [
        { label: `Resume Episode ${autoAdvanceData.currentEpisode.number} (${autoAdvanceData.percentage}%)`, value: "resume", episodeId: autoAdvanceData.currentEpisode.episodeId, number: autoAdvanceData.currentEpisode.number },
        { label: `Start Next Episode ${autoAdvanceData.nextEpisode.number}`, value: "next", episodeId: autoAdvanceData.nextEpisode.episodeId, number: autoAdvanceData.nextEpisode.number }
      ],
      onSelect: (item) => handleEpisodeSelect(item),
      onBack: goBack,
      title: `\u23ED\uFE0F Continue Watching?`,
      color: theme.cyan,
      showNumbers: true,
      enableSearch: false
    }
  ))), screen === "login-waiting" && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", width: Math.min(55, termSize2.cols - 4) }, /* @__PURE__ */ React.createElement(Box, { borderStyle: "round", borderColor: theme.purple, paddingX: 2, paddingY: 1, flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.purple, bold: true }, "[L] Login to NyAnime"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(45)), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "1. Check your browser"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "2. Sign in or Authorize ny-cli"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "3. Return to terminal when done"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(45)), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "Waiting for authorization..."))), screen === "profile" && /* @__PURE__ */ React.createElement(Box, { flexDirection: termSize2.cols < 70 ? "column" : "row", gap: 2 }, userPhotoUrl ? /* @__PURE__ */ React.createElement(Box, { width: 18, height: 14 }, /* @__PURE__ */ React.createElement(AnimeArtwork, { title: "", imageUrl: userPhotoUrl, width: 18, height: 14 })) : /* @__PURE__ */ React.createElement(Box, { borderStyle: "round", borderColor: theme.purple, width: 16, height: 12, justifyContent: "center", alignItems: "center" }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "[No Photo]")), /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", width: Math.min(50, termSize2.cols - 4) }, /* @__PURE__ */ React.createElement(Box, { borderStyle: "round", borderColor: theme.purple, paddingX: 2, paddingY: 1, flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.purple, bold: true }, "[P] ", username), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(35)), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "UID: ", /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, getToken().substring(0, 12), "...")), syncMessage ? /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, syncMessage) : null), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: profileMenuItems,
      onSelect: handleProfileAction,
      color: theme.purple,
      showBorder: true
    }
  )))), screen === "settings" && /* @__PURE__ */ React.createElement(
    SettingsScreen,
    {
      settings: appSettings,
      onUpdate: (newSettings) => {
        setAppSettings(newSettings);
        saveSettings(newSettings);
      },
      onBack: goBack
    }
  ), screen === "help" && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", width: Math.min(55, termSize2.cols - 4) }, /* @__PURE__ */ React.createElement(Box, { borderStyle: "round", borderColor: theme.blue, paddingX: 2, paddingY: 1, flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.blue, bold: true }, "[?] NY-CLI Help"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(45)), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "USAGE:"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  ny-cli              Interactive mode"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, '  ny-cli "one piece"  Quick search'), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "NAVIGATION:"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  Up/Down or j/k  Navigate"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  Enter           Select"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  b or Left       Go back"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  1-9             Quick select"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  q               Quit"), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "CLOUD SYNC:"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  Login with your nyanime.qzz.io account"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  to sync watch history across devices"), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "PLAYER (mpv):"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  Space  Play/Pause  |  f  Fullscreen"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  Left/Right   Seek  |  q  Quit")), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "Press b or Left to go back")), /* @__PURE__ */ React.createElement(HelpBackHandler, { onBack: goBack })), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(StatusBar, { ...status })));
}
function HelpBackHandler({ onBack }) {
  useInput((input, key) => {
    if (key.escape || input === "b" || key.leftArrow || input === "q") {
      if (input === "q") process.exit(0);
      onBack();
    }
  });
  return null;
}
process.stdout.write("\x1Bc");
var instance = render(
  /* @__PURE__ */ React.createElement(TerminalInfoProvider, null, /* @__PURE__ */ React.createElement(App, null))
);
process.on("exit", () => {
  instance.clear();
});
process.on("SIGINT", () => {
  instance.clear();
  process.exit(0);
});
process.on("SIGTERM", () => {
  instance.clear();
  process.exit(0);
});
