/**
 * Central helper to resolve FFmpeg and FFprobe binary paths.
 *
 * In production the esbuild bundle outputs ESM, which means bare `require()`
 * calls for `ffmpeg-static` / `ffprobe-static` fail silently (the esbuild
 * __require shim throws "Dynamic require not supported").
 *
 * To work around this we resolve the binary paths by walking `node_modules`
 * directly, which works regardless of module format.
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

function which(bin: string): string | null {
  try {
    return execSync(`which ${bin}`, { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

let _ffmpegPath: string | null = null;
let _ffprobePath: string | null = null;

/**
 * Try to resolve a package's main export using createRequire.
 * Falls back to manual node_modules walking if createRequire isn't available.
 */
function resolvePackage(packageName: string): any | null {
  // Method 1: createRequire (works in both CJS and ESM)
  try {
    const require = createRequire(import.meta.url);
    return require(packageName);
  } catch {
    // createRequire failed or import.meta.url not available
  }

  // Method 2: Walk up from this file to find node_modules
  try {
    // In bundled output, __dirname may point to dist/
    // Walk up to find the project root's node_modules
    const candidates = [
      // From the source file location
      path.resolve(__dirname, "../../node_modules", packageName),
      // From process.cwd() (project root)
      path.resolve(process.cwd(), "node_modules", packageName),
      // Common pnpm nested path
      path.resolve(process.cwd(), "node_modules/.pnpm"),
    ];

    for (const candidate of candidates) {
      const indexFile = path.join(candidate, "index.js");
      if (existsSync(indexFile)) {
        // For ffmpeg-static, the index.js exports the binary path
        // We can't require it, so we resolve the binary path directly
        if (packageName === "ffmpeg-static") {
          const binaryPath = path.join(candidate, "ffmpeg");
          if (existsSync(binaryPath)) return binaryPath;
        } else if (packageName === "ffprobe-static") {
          const binaryPath = path.join(candidate, "bin", "linux", "x64", "ffprobe");
          if (existsSync(binaryPath)) return { path: binaryPath };
        }
      }
    }
  } catch {
    // Manual resolution failed
  }

  // Method 3: Search pnpm's nested node_modules structure
  try {
    const pnpmBase = path.resolve(process.cwd(), "node_modules/.pnpm");
    if (existsSync(pnpmBase)) {
      const { readdirSync } = require("fs");
      const dirs = readdirSync(pnpmBase) as string[];
      for (const dir of dirs) {
        if (dir.startsWith(packageName.replace("/", "+"))) {
          if (packageName === "ffmpeg-static") {
            const binaryPath = path.join(pnpmBase, dir, "node_modules", packageName, "ffmpeg");
            if (existsSync(binaryPath)) return binaryPath;
          } else if (packageName === "ffprobe-static") {
            const binaryPath = path.join(pnpmBase, dir, "node_modules", packageName, "bin", "linux", "x64", "ffprobe");
            if (existsSync(binaryPath)) return { path: binaryPath };
          }
        }
      }
    }
  } catch {
    // pnpm search failed
  }

  return null;
}

/**
 * Ensure the ffmpeg-static binary exists, downloading it if needed.
 */
function ensureFFmpegStaticBinary(staticPath: string): boolean {
  if (existsSync(staticPath)) return true;

  // The binary wasn't downloaded — try running the install script
  try {
    const pkgDir = path.dirname(staticPath);
    const installScript = path.join(pkgDir, "install.js");
    if (existsSync(installScript)) {
      console.log(`[FFmpeg] Binary missing at ${staticPath}, running install script...`);
      execSync(`node "${installScript}"`, {
        cwd: pkgDir,
        timeout: 120000,
        stdio: "pipe",
      });
      return existsSync(staticPath);
    }
  } catch (err) {
    console.error(`[FFmpeg] Failed to download binary:`, err);
  }
  return false;
}

/**
 * Return the absolute path to the ffmpeg binary.
 * Prioritizes ffmpeg-static (works in production), then falls back to system binary.
 */
export function getFFmpegPath(): string {
  if (_ffmpegPath) return _ffmpegPath;

  // 1. Try ffmpeg-static npm package FIRST (most reliable in production)
  try {
    const staticResult = resolvePackage("ffmpeg-static");
    const staticPath = typeof staticResult === "string" ? staticResult : null;
    if (staticPath && ensureFFmpegStaticBinary(staticPath)) {
      _ffmpegPath = staticPath;
      console.log(`[FFmpeg] Using ffmpeg-static: ${staticPath}`);
      return staticPath;
    }
  } catch (err) {
    console.warn(`[FFmpeg] ffmpeg-static resolution failed:`, err);
  }

  // 2. System binary fallback
  const sys = which("ffmpeg");
  if (sys) {
    _ffmpegPath = sys;
    console.log(`[FFmpeg] Using system binary: ${sys}`);
    return sys;
  }

  // 3. Last resort — hope it's on PATH
  _ffmpegPath = "ffmpeg";
  console.warn("[FFmpeg] No binary found, falling back to bare 'ffmpeg'");
  return "ffmpeg";
}

/**
 * Return the absolute path to the ffprobe binary.
 * Prioritizes ffprobe-static (works in production), then falls back to system binary.
 */
export function getFFprobePath(): string {
  if (_ffprobePath) return _ffprobePath;

  // 1. Try ffprobe-static npm package FIRST
  try {
    const staticResult = resolvePackage("ffprobe-static");
    const staticPath = staticResult?.path || null;
    if (staticPath && existsSync(staticPath)) {
      _ffprobePath = staticPath;
      console.log(`[FFprobe] Using ffprobe-static: ${staticPath}`);
      return staticPath;
    }
  } catch (err) {
    console.warn(`[FFprobe] ffprobe-static resolution failed:`, err);
  }

  // 2. System binary fallback
  const sys = which("ffprobe");
  if (sys) {
    _ffprobePath = sys;
    console.log(`[FFprobe] Using system binary: ${sys}`);
    return sys;
  }

  // 3. Last resort
  _ffprobePath = "ffprobe";
  console.warn("[FFprobe] No binary found, falling back to bare 'ffprobe'");
  return "ffprobe";
}
