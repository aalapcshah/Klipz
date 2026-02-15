/**
 * Central helper to resolve FFmpeg and FFprobe binary paths.
 *
 * In production the system-level binaries may not exist, so we fall back
 * to the statically-linked copies shipped by `ffmpeg-static` and
 * `ffprobe-static`.  In development (or any environment where the
 * system binaries are on $PATH) we prefer them because they are usually
 * newer and match the OS exactly.
 *
 * The ffmpeg-static package sometimes doesn't download its binary during
 * install (pnpm postinstall issue). We detect this and run the install
 * script on first access.
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";

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
 * Ensure the ffmpeg-static binary exists, downloading it if needed.
 */
function ensureFFmpegStaticBinary(staticPath: string): boolean {
  if (existsSync(staticPath)) return true;

  // The binary wasn't downloaded — try running the install script
  try {
    const pkgDir = path.dirname(staticPath);
    const installScript = path.join(pkgDir, "install.js");
    if (existsSync(installScript)) {
      console.log(`[FFmpeg] Binary missing, running install script...`);
      execSync(`node "${installScript}"`, {
        cwd: pkgDir,
        timeout: 120000, // 2 min timeout for download
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
 * Tries the system binary first, then falls back to ffmpeg-static.
 */
export function getFFmpegPath(): string {
  if (_ffmpegPath) return _ffmpegPath;

  // 1. System binary
  const sys = which("ffmpeg");
  if (sys) {
    _ffmpegPath = sys;
    console.log(`[FFmpeg] Using system binary: ${sys}`);
    return sys;
  }

  // 2. ffmpeg-static npm package
  try {
    const staticPath = require("ffmpeg-static") as string;
    if (staticPath && ensureFFmpegStaticBinary(staticPath)) {
      _ffmpegPath = staticPath;
      console.log(`[FFmpeg] Using ffmpeg-static: ${staticPath}`);
      return staticPath;
    }
  } catch {
    // package not installed
  }

  // 3. Last resort — hope it's on PATH
  _ffmpegPath = "ffmpeg";
  console.warn("[FFmpeg] No binary found, falling back to bare 'ffmpeg'");
  return "ffmpeg";
}

/**
 * Return the absolute path to the ffprobe binary.
 * Tries the system binary first, then falls back to ffprobe-static.
 */
export function getFFprobePath(): string {
  if (_ffprobePath) return _ffprobePath;

  // 1. System binary
  const sys = which("ffprobe");
  if (sys) {
    _ffprobePath = sys;
    console.log(`[FFprobe] Using system binary: ${sys}`);
    return sys;
  }

  // 2. ffprobe-static npm package
  try {
    const staticMod = require("ffprobe-static") as { path: string };
    if (staticMod?.path && existsSync(staticMod.path)) {
      _ffprobePath = staticMod.path;
      console.log(`[FFprobe] Using ffprobe-static: ${staticMod.path}`);
      return staticMod.path;
    }
  } catch {
    // package not installed
  }

  // 3. Last resort
  _ffprobePath = "ffprobe";
  console.warn("[FFprobe] No binary found, falling back to bare 'ffprobe'");
  return "ffprobe";
}
