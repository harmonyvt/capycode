# Scripts

- `bun run dev` — Starts contracts, server, and web in `turbo watch` mode.
- `bun run dev:server` — Starts just the WebSocket server (uses Bun TypeScript execution).
- `bun run dev:web` — Starts just the Vite dev server for the web app.
- Dev commands default `T3CODE_STATE_DIR` to `~/.t3/dev` to keep dev state isolated from desktop/prod state.
- Override server CLI-equivalent flags from root dev commands with `--`, for example:
  `bun run dev -- --state-dir ~/.t3/another-dev-state`
- `bun run start` — Runs the production server (serves built web app as static files).
- `bun run build` — Builds contracts, web app, and server through Turbo.
- `bun run service:mac:install` — Builds Capycode, writes `~/Library/LaunchAgents/com.t3tools.capycode.plist`, and loads it as a user background service with `launchctl`.
- `bun run service:mac:update` — Fast-forwards the repo from `origin/main`, runs `bun install --frozen-lockfile`, rebuilds, and reloads the Capycode LaunchAgent.
- `bun run service:mac:status` — Prints `launchctl` status for the Capycode LaunchAgent.
- `bun run service:mac:uninstall` — Unloads and removes the Capycode LaunchAgent plist.
- `bun run service:mac:print` — Prints the LaunchAgent plist that would be installed.
- `bun run service:mac:show` — Shows the currently installed LaunchAgent plist.
- `bun run typecheck` — Strict TypeScript checks for all packages.
- `bun run test` — Runs workspace tests.

## macOS background service

- The service installer uses a user `LaunchAgent`, not a system `LaunchDaemon`, so it runs with the signed-in user's Codex auth and home directory.
- Default bind is `127.0.0.1:3773`; override with `-- --host <host> --port <port>`.
- Default state dir is `~/.t3/userdata`; override with `-- --state-dir <dir>`.
- Logs go to `~/Library/Logs/capycode/com.t3tools.capycode.stdout.log` and `.stderr.log` by default.
- Update in place with:
  `bun run service:mac:update`
- By default `service:mac:update` refuses to run on a dirty worktree; override only if you mean it with:
  `bun run service:mac:update -- --allow-dirty`
- Example install with explicit settings:
  `bun run service:mac:install -- --host 0.0.0.0 --port 3773 --state-dir ~/.t3/userdata`
- Re-run `bun run service:mac:install` after moving the repo or changing the Node binary used to install the service, because the plist stores absolute paths.
- `bun run dist:desktop:artifact -- --platform <mac|linux|win> --target <target> --arch <arch>` — Builds a desktop artifact for a specific platform/target/arch.
- `bun run dist:desktop:dmg` — Builds a shareable macOS `.dmg` into `./release`.
- `bun run dist:desktop:dmg:x64` — Builds an Intel macOS `.dmg`.
- `bun run dist:desktop:linux` — Builds a Linux AppImage into `./release`.
- `bun run dist:desktop:win` — Builds a Windows NSIS installer into `./release`.

## Desktop `.dmg` packaging notes

- Default build is unsigned/not notarized for local sharing.
- The DMG build uses `assets/macos-icon-1024.png` as the production app icon source.
- Desktop production windows load the bundled UI from `capycode://app/index.html` (not a `127.0.0.1` document URL).
- Desktop packaging includes `apps/server/dist` (the `capycode` backend) and starts it on loopback with an auth token for WebSocket/API traffic.
- Your tester can still open it on macOS by right-clicking the app and choosing **Open** on first launch.
- To keep staging files for debugging package contents, run: `bun run dist:desktop:dmg -- --keep-stage`
- To allow code-signing/notarization when configured in CI/secrets, add: `--signed`.
- Windows `--signed` uses Azure Trusted Signing and expects:
  `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`,
  `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`, and `AZURE_TRUSTED_SIGNING_PUBLISHER_NAME`.
- Azure authentication env vars are also required (for example service principal with secret):
  `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.

## Running multiple dev instances

Set `T3CODE_DEV_INSTANCE` to any value to deterministically shift all dev ports together.

- Default ports: server `3773`, web `5733`
- Shifted ports: `base + offset` (offset is hashed from `T3CODE_DEV_INSTANCE`)
- Example: `T3CODE_DEV_INSTANCE=branch-a bun run dev:desktop`

If you want full control instead of hashing, set `T3CODE_PORT_OFFSET` to a numeric offset.
