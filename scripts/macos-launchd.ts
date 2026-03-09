#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Data, Effect, Layer, Logger, Option, Schema } from "effect";
import { Command, Flag } from "effect/unstable/cli";

const DEFAULT_LABEL = "com.t3tools.capycode";
const DEFAULT_PORT = 3773;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_STATE_DIR = "~/.t3/userdata";
const DEFAULT_LOG_DIR = "~/Library/Logs/capycode";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const launchAgentsDir = path.join(os.homedir(), "Library", "LaunchAgents");

class CliError extends Data.TaggedError("CliError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

interface LaunchAgentOptions {
  readonly label: string;
  readonly plistPath: string;
  readonly host: string;
  readonly port: number;
  readonly stateDir: string;
  readonly logDir: string;
  readonly authToken: string | undefined;
}

interface SpawnResult {
  readonly stdout: string;
  readonly stderr: string;
}

interface InstallInput {
  readonly label: string;
  readonly host: string;
  readonly port: number;
  readonly stateDir: string;
  readonly logDir: string;
  readonly plistPath: Option.Option<string>;
  readonly authToken: Option.Option<string>;
  readonly skipBuild: boolean;
}

function expandHomePath(input: string): string {
  if (input === "~") {
    return os.homedir();
  }

  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(os.homedir(), input.slice(2));
  }

  return input;
}

function sanitizeFileComponent(input: string): string {
  return input.replace(/[^A-Za-z0-9._-]/g, "-");
}

function xmlEscape(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function plistArray(values: ReadonlyArray<string>): string {
  return values.map((value) => `    <string>${xmlEscape(value)}</string>`).join("\n");
}

function plistDict(values: Record<string, string>): string {
  return Object.entries(values)
    .map(
      ([key, value]) => `    <key>${xmlEscape(key)}</key>
    <string>${xmlEscape(value)}</string>`,
    )
    .join("\n");
}

export function resolveLaunchAgentOptions(input: {
  readonly label: string;
  readonly plistPath: string | undefined;
  readonly host: string;
  readonly port: number;
  readonly stateDir: string;
  readonly logDir: string;
  readonly authToken: string | undefined;
}): LaunchAgentOptions {
  const labelFile = `${sanitizeFileComponent(input.label)}.plist`;

  return {
    label: input.label,
    plistPath: path.resolve(
      expandHomePath(input.plistPath ?? path.join(launchAgentsDir, labelFile)),
    ),
    host: input.host,
    port: input.port,
    stateDir: path.resolve(expandHomePath(input.stateDir)),
    logDir: path.resolve(expandHomePath(input.logDir)),
    authToken: input.authToken,
  };
}

export function renderLaunchAgentPlist(input: LaunchAgentOptions): string {
  const safeLabel = sanitizeFileComponent(input.label);
  const serverEntry = path.join(repoRoot, "apps", "server", "dist", "index.mjs");
  const stdoutPath = path.join(input.logDir, `${safeLabel}.stdout.log`);
  const stderrPath = path.join(input.logDir, `${safeLabel}.stderr.log`);
  const programArguments = [
    process.execPath,
    serverEntry,
    "--mode",
    "web",
    "--host",
    input.host,
    "--port",
    String(input.port),
    "--state-dir",
    input.stateDir,
    "--no-browser",
  ];

  if (input.authToken) {
    programArguments.push("--auth-token", input.authToken);
  }

  const environmentVariables: Record<string, string> = {
    HOME: os.homedir(),
    PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
    T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD:
      process.env.T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD ?? "0",
  };

  if (process.env.SHELL) {
    environmentVariables.SHELL = process.env.SHELL;
  }
  if (process.env.LANG) {
    environmentVariables.LANG = process.env.LANG;
  }
  if (process.env.USER) {
    environmentVariables.USER = process.env.USER;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(input.label)}</string>
  <key>ProgramArguments</key>
  <array>
${plistArray(programArguments)}
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(repoRoot)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${plistDict(environmentVariables)}
  </dict>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${xmlEscape(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(stderrPath)}</string>
</dict>
</plist>
`;
}

const ensureDarwin = Effect.sync(() => {
  if (process.platform !== "darwin") {
    throw new CliError({ message: "This command only supports macOS launchd." });
  }
});

const runCommand = Effect.fn("runCommand")(function* (input: {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd?: string;
  readonly allowFailure?: boolean;
}) {
  const result = yield* Effect.try({
    try: () =>
      spawnSync(input.command, input.args, {
        cwd: input.cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    catch: (cause) =>
      new CliError({
        message: `Failed to start ${input.command}`,
        cause,
      }),
  });

  if (result.error) {
    return yield* new CliError({
      message: `Failed to run ${input.command}`,
      cause: result.error,
    });
  }

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  if ((result.status ?? 1) !== 0 && !input.allowFailure) {
    return yield* new CliError({
      message: `${input.command} ${input.args.join(" ")} exited with code ${String(result.status ?? "unknown")}`,
      cause: stderr || stdout,
    });
  }

  return { stdout, stderr } satisfies SpawnResult;
});

const ensureBuildArtifacts = Effect.fn("ensureBuildArtifacts")(function* () {
  const serverEntry = path.join(repoRoot, "apps", "server", "dist", "index.mjs");
  const clientEntry = path.join(repoRoot, "apps", "server", "dist", "client", "index.html");

  if (!existsSync(serverEntry) || !existsSync(clientEntry)) {
    return yield* new CliError({
      message:
        "Missing production build output. Run `bun run build` or use `bun run service:mac:install` without `--skip-build`.",
    });
  }
});

const writeLaunchAgent = Effect.fn("writeLaunchAgent")(function* (options: LaunchAgentOptions) {
  const plist = renderLaunchAgentPlist(options);

  yield* Effect.tryPromise({
    try: async () => {
      await mkdir(path.dirname(options.plistPath), { recursive: true });
      await mkdir(options.logDir, { recursive: true });
      await mkdir(options.stateDir, { recursive: true });
      await writeFile(options.plistPath, plist, "utf8");
    },
    catch: (cause) =>
      new CliError({
        message: `Failed to write LaunchAgent plist at ${options.plistPath}`,
        cause,
      }),
  });

  yield* runCommand({
    command: "plutil",
    args: ["-lint", options.plistPath],
  });
});

const readLaunchAgent = Effect.fn("readLaunchAgent")(function* (plistPath: string) {
  return yield* Effect.tryPromise({
    try: () => readFile(plistPath, "utf8"),
    catch: (cause) =>
      new CliError({
        message: `Failed to read LaunchAgent plist at ${plistPath}`,
        cause,
      }),
  });
});

function guiDomain(label?: string): string {
  const uid = process.getuid?.();
  if (uid === undefined) {
    throw new CliError({ message: "Unable to resolve the current macOS user id." });
  }

  return label ? `gui/${uid}/${label}` : `gui/${uid}`;
}

const bootoutIfLoaded = Effect.fn("bootoutIfLoaded")(function* (options: LaunchAgentOptions) {
  yield* runCommand({
    command: "launchctl",
    args: ["bootout", guiDomain(), options.plistPath],
    allowFailure: true,
  });
});

const bootstrapLaunchAgent = Effect.fn("bootstrapLaunchAgent")(function* (
  options: LaunchAgentOptions,
) {
  yield* runCommand({
    command: "launchctl",
    args: ["bootstrap", guiDomain(), options.plistPath],
  });
  yield* runCommand({
    command: "launchctl",
    args: ["kickstart", "-k", guiDomain(options.label)],
  });
});

const removeLaunchAgent = Effect.fn("removeLaunchAgent")(function* (plistPath: string) {
  yield* Effect.tryPromise({
    try: () => rm(plistPath, { force: true }),
    catch: (cause) =>
      new CliError({
        message: `Failed to remove LaunchAgent plist at ${plistPath}`,
        cause,
      }),
  });
});

const ensureCleanWorktree = Effect.fn("ensureCleanWorktree")(function* () {
  const result = yield* runCommand({
    command: "git",
    args: ["status", "--short"],
    cwd: repoRoot,
  });

  if (result.stdout.trim().length > 0) {
    return yield* new CliError({
      message:
        "Refusing to update from main with a dirty worktree. Commit/stash changes or rerun with `--allow-dirty`.",
      cause: result.stdout.trim(),
    });
  }
});

const syncRepoToBranch = Effect.fn("syncRepoToBranch")(function* (input: {
  readonly remote: string;
  readonly branch: string;
}) {
  yield* Effect.logInfo("Fetching latest branch state", input);
  yield* runCommand({
    command: "git",
    args: ["fetch", input.remote, input.branch],
    cwd: repoRoot,
  });
  yield* runCommand({
    command: "git",
    args: ["switch", input.branch],
    cwd: repoRoot,
  });
  yield* runCommand({
    command: "git",
    args: ["pull", "--ff-only", input.remote, input.branch],
    cwd: repoRoot,
  });
});

const installDependencies = Effect.fn("installDependencies")(function* () {
  yield* Effect.logInfo("Refreshing dependencies", {
    command: "bun install --frozen-lockfile",
  });
  yield* runCommand({
    command: "bun",
    args: ["install", "--frozen-lockfile"],
    cwd: repoRoot,
  });
});

const installLaunchAgent = Effect.fn("installLaunchAgent")(function* (input: InstallInput) {
  const options = resolveLaunchAgentOptions({
    ...input,
    plistPath: Option.getOrUndefined(input.plistPath),
    authToken: Option.getOrUndefined(input.authToken),
  });

  if (!input.skipBuild) {
    yield* Effect.logInfo("Building production artifacts", {
      command: "bun run build",
    });
    yield* runCommand({
      command: "bun",
      args: ["run", "build"],
      cwd: repoRoot,
    });
  }

  yield* ensureBuildArtifacts();
  yield* writeLaunchAgent(options);
  yield* bootoutIfLoaded(options);
  yield* bootstrapLaunchAgent(options);

  yield* Effect.logInfo("Capycode LaunchAgent installed", {
    label: options.label,
    plistPath: options.plistPath,
    stateDir: options.stateDir,
    logDir: options.logDir,
    url: `http://${options.host === "0.0.0.0" ? "localhost" : options.host}:${options.port}`,
  });
});

const installFlags = {
  label: Flag.string("label").pipe(
    Flag.withDescription("LaunchAgent label."),
    Flag.withDefault(DEFAULT_LABEL),
  ),
  host: Flag.string("host").pipe(
    Flag.withDescription("Host/interface for the Capycode web server."),
    Flag.withDefault(DEFAULT_HOST),
  ),
  port: Flag.integer("port").pipe(
    Flag.withSchema(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 }))),
    Flag.withDescription("Port for the Capycode web server."),
    Flag.withDefault(DEFAULT_PORT),
  ),
  stateDir: Flag.string("state-dir").pipe(
    Flag.withDescription("Persistent Capycode state directory."),
    Flag.withDefault(DEFAULT_STATE_DIR),
  ),
  logDir: Flag.string("log-dir").pipe(
    Flag.withDescription("Directory for launchd stdout/stderr logs."),
    Flag.withDefault(DEFAULT_LOG_DIR),
  ),
  plistPath: Flag.string("plist-path").pipe(
    Flag.withDescription("Optional override for the LaunchAgent plist path."),
    Flag.optional,
  ),
  authToken: Flag.string("auth-token").pipe(
    Flag.withDescription("Optional auth token forwarded to the Capycode server."),
    Flag.optional,
  ),
  skipBuild: Flag.boolean("skip-build").pipe(
    Flag.withDescription("Skip `bun run build` before installing the LaunchAgent."),
    Flag.withDefault(false),
  ),
};

const installCmd = Command.make("install", installFlags, (input) =>
  Effect.gen(function* () {
    yield* ensureDarwin;
    yield* installLaunchAgent(input);
  }),
).pipe(Command.withDescription("Build Capycode and install it as a user LaunchAgent."));

const updateCmd = Command.make(
  "update",
  {
    ...installFlags,
    remote: Flag.string("remote").pipe(
      Flag.withDescription("Git remote to fast-forward from."),
      Flag.withDefault("origin"),
    ),
    branch: Flag.string("branch").pipe(
      Flag.withDescription("Git branch to fast-forward from."),
      Flag.withDefault("main"),
    ),
    allowDirty: Flag.boolean("allow-dirty").pipe(
      Flag.withDescription("Allow update to proceed even if the repo has local modifications."),
      Flag.withDefault(false),
    ),
  },
  (input) =>
    Effect.gen(function* () {
      yield* ensureDarwin;

      if (!input.allowDirty) {
        yield* ensureCleanWorktree();
      }

      yield* syncRepoToBranch({
        remote: input.remote,
        branch: input.branch,
      });
      yield* installDependencies();
      yield* installLaunchAgent({
        ...input,
      });
    }),
).pipe(
  Command.withDescription(
    "Fast-forward the repo from a git branch, refresh dependencies, rebuild, and reload the LaunchAgent.",
  ),
);

const uninstallCmd = Command.make(
  "uninstall",
  {
    label: installFlags.label,
    plistPath: installFlags.plistPath,
  },
  (input) =>
    Effect.gen(function* () {
      yield* ensureDarwin;

      const options = resolveLaunchAgentOptions({
        label: input.label,
        plistPath: Option.getOrUndefined(input.plistPath),
        host: DEFAULT_HOST,
        port: DEFAULT_PORT,
        stateDir: DEFAULT_STATE_DIR,
        logDir: DEFAULT_LOG_DIR,
        authToken: undefined,
      });

      yield* bootoutIfLoaded(options);
      yield* removeLaunchAgent(options.plistPath);

      yield* Effect.logInfo("Capycode LaunchAgent removed", {
        label: options.label,
        plistPath: options.plistPath,
      });
    }),
).pipe(Command.withDescription("Unload and remove the Capycode LaunchAgent plist."));

const statusCmd = Command.make(
  "status",
  {
    label: installFlags.label,
  },
  (input) =>
    Effect.gen(function* () {
      yield* ensureDarwin;

      const result = yield* runCommand({
        command: "launchctl",
        args: ["print", guiDomain(input.label)],
        allowFailure: true,
      });

      if (result.stdout.trim().length === 0 && result.stderr.trim().length === 0) {
        yield* Effect.logInfo("No launchctl status output returned", { label: input.label });
        return;
      }

      if (result.stdout.trim().length > 0) {
        console.log(result.stdout.trimEnd());
      }

      if (result.stderr.trim().length > 0) {
        console.error(result.stderr.trimEnd());
      }
    }),
).pipe(Command.withDescription("Print `launchctl` status for the Capycode LaunchAgent."));

const printCmd = Command.make(
  "print-plist",
  {
    label: installFlags.label,
    host: installFlags.host,
    port: installFlags.port,
    stateDir: installFlags.stateDir,
    logDir: installFlags.logDir,
    plistPath: installFlags.plistPath,
    authToken: installFlags.authToken,
  },
  (input) =>
    Effect.gen(function* () {
      yield* ensureDarwin;

      const options = resolveLaunchAgentOptions({
        ...input,
        plistPath: Option.getOrUndefined(input.plistPath),
        authToken: Option.getOrUndefined(input.authToken),
      });

      console.log(renderLaunchAgentPlist(options));
    }),
).pipe(Command.withDescription("Print the LaunchAgent plist that install would write."));

const catCmd = Command.make(
  "show-plist",
  {
    label: installFlags.label,
    plistPath: installFlags.plistPath,
  },
  (input) =>
    Effect.gen(function* () {
      yield* ensureDarwin;

      const options = resolveLaunchAgentOptions({
        label: input.label,
        plistPath: Option.getOrUndefined(input.plistPath),
        host: DEFAULT_HOST,
        port: DEFAULT_PORT,
        stateDir: DEFAULT_STATE_DIR,
        logDir: DEFAULT_LOG_DIR,
        authToken: undefined,
      });

      if (!existsSync(options.plistPath)) {
        return yield* new CliError({
          message: `No LaunchAgent plist found at ${options.plistPath}`,
        });
      }

      console.log(yield* readLaunchAgent(options.plistPath));
    }),
).pipe(Command.withDescription("Show the currently installed LaunchAgent plist."));

const cli = Command.make("macos-launchd").pipe(
  Command.withDescription("Manage Capycode as a macOS background service via launchd."),
  Command.withSubcommands([installCmd, updateCmd, uninstallCmd, statusCmd, printCmd, catCmd]),
);

const runtimeLayer = Layer.mergeAll(Logger.layer([Logger.consolePretty()]), NodeServices.layer);

const runtimeProgram = Command.run(cli, { version: "0.0.0" }).pipe(
  Effect.scoped,
  Effect.provide(runtimeLayer),
);

if (import.meta.main) {
  NodeRuntime.runMain(runtimeProgram);
}
