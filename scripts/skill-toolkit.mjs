#!/usr/bin/env node
// Finds, installs and runs the doodle-video-generator toolkit for a skill.
// Dependency-free so it works right after `npx skills add` copies the skill.
//
//   node toolkit.mjs status                 where the toolkit is, and FFmpeg checks
//   node toolkit.mjs install [--from SPEC]  install the toolkit (downloads packages)
//   node toolkit.mjs run -- <args>          run a toolkit command
//
// The source of this file is scripts/skill-toolkit.mjs in the repository;
// scripts/sync-skill-files.mjs copies it into every skill.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";

const VERSION = "0.1.0";
const PACKAGE = "doodle-video-generator";
const isWindows = platform() === "win32";

/** Where `install` puts the toolkit: DVG_HOME, or a per-user cache folder. */
const installRoot = () =>
  process.env.DVG_HOME ||
  path.join(
    process.env.XDG_CACHE_HOME || (isWindows ? process.env.LOCALAPPDATA || homedir() : path.join(homedir(), ".cache")),
    PACKAGE,
    VERSION,
  );

const binIn = (prefix) => path.join(prefix, "node_modules", PACKAGE, "bin", `${PACKAGE}.js`);

const onPath = () => {
  const finder = isWindows ? "where" : "which";
  const result = spawnSync(finder, [PACKAGE], { encoding: "utf8" });
  if (result.status !== 0) return undefined;
  return result.stdout.split(/\r?\n/).find(Boolean);
};

/** Resolves the toolkit: DVG_CLI, the project's node_modules, the install cache, then PATH. */
export const findToolkit = () => {
  if (process.env.DVG_CLI && existsSync(process.env.DVG_CLI)) return { how: "DVG_CLI", command: [process.execPath, process.env.DVG_CLI] };
  const local = binIn(process.cwd());
  if (existsSync(local)) return { how: "project node_modules", command: [process.execPath, local] };
  const cached = binIn(installRoot());
  if (existsSync(cached)) return { how: `install cache (${installRoot()})`, command: [process.execPath, cached] };
  const global = onPath();
  if (global) return { how: "PATH", command: [global] };
  return undefined;
};

const has = (bin) => spawnSync(bin, ["-version"], { encoding: "utf8" }).status === 0;

const installHelp = `The toolkit is not installed. Ask the user before installing: it downloads npm packages.

  node "${path.join(import.meta.dirname, "toolkit.mjs")}" install
      installs ${PACKAGE}@${VERSION} from npm into ${installRoot()}
  node "${path.join(import.meta.dirname, "toolkit.mjs")}" install --from github:OWNER/${PACKAGE}#v${VERSION}
      installs from the GitHub repository instead (npm builds it on install)
  node "${path.join(import.meta.dirname, "toolkit.mjs")}" install --from /path/to/${PACKAGE}
      installs from a local checkout or a .tgz made with npm pack

Set DVG_HOME to choose another install folder, or DVG_CLI to point at an existing bin file.`;

const [command, ...rest] = process.argv.slice(2);

if (command === "status") {
  const found = findToolkit();
  const ffmpeg = has(process.env.DVG_FFMPEG || "ffmpeg");
  const ffprobe = has(process.env.DVG_FFPROBE || "ffprobe");
  console.log(`toolkit: ${found ? `found via ${found.how}` : "not installed"}`);
  if (found) {
    const v = spawnSync(found.command[0], [...found.command.slice(1), "--version"], { encoding: "utf8" });
    console.log(`version: ${(v.stdout || "").trim() || "unknown"}`);
  }
  console.log(`ffmpeg: ${ffmpeg ? "ok" : "missing"}`);
  console.log(`ffprobe: ${ffprobe ? "ok" : "missing"}`);
  console.log(`node: ${process.version}`);
  if (!found) console.log(`\n${installHelp}`);
  if (!ffmpeg || !ffprobe) console.log("\nInstall FFmpeg 5 or later (it includes ffprobe) from your package manager or ffmpeg.org.");
  process.exit(found && ffmpeg && ffprobe ? 0 : 1);
}

if (command === "install") {
  const fromIndex = rest.indexOf("--from");
  const spec = fromIndex >= 0 ? rest[fromIndex + 1] : `${PACKAGE}@${VERSION}`;
  if (!spec) {
    console.error("--from needs a package spec, a git URL, a folder or a .tgz file");
    process.exit(1);
  }
  const root = installRoot();
  mkdirSync(root, { recursive: true });
  const resolved = existsSync(spec) ? path.resolve(spec) : spec;
  console.log(`Installing ${resolved} into ${root}…`);
  const npm = isWindows ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["install", "--prefix", root, "--no-fund", "--no-audit", "--omit=dev", resolved], {
    stdio: "inherit",
    shell: isWindows,
  });
  if (result.status !== 0) {
    console.error("npm install failed. Check the output above, then try again.");
    process.exit(result.status ?? 1);
  }
  if (!existsSync(binIn(root))) {
    console.error(`Installed, but ${binIn(root)} is missing. The package may not be ${PACKAGE}.`);
    process.exit(1);
  }
  console.log(`Installed. Run commands with: node "${path.join(import.meta.dirname, "toolkit.mjs")}" run -- --help`);
  process.exit(0);
}

if (command === "run") {
  const found = findToolkit();
  if (!found) {
    console.error(installHelp);
    process.exit(127);
  }
  const args = rest[0] === "--" ? rest.slice(1) : rest;
  const result = spawnSync(found.command[0], [...found.command.slice(1), ...args], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

console.error("Usage: node toolkit.mjs status | install [--from SPEC] | run -- <toolkit arguments>");
process.exit(1);
