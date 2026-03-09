import { describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";

import {
  parseTailscaleDnsName,
  parseTailscaleIpv4,
  resolveInstallHost,
} from "./macos-launchd";

describe("macos-launchd tailscale helpers", () => {
  it("parses the first tailscale IPv4 address", () => {
    expect(parseTailscaleIpv4("\n100.88.10.4\nfd7a:115c:a1e0::1234\n")).toBe("100.88.10.4");
  });

  it("parses and normalizes the tailscale DNS name", () => {
    expect(
      parseTailscaleDnsName(JSON.stringify({ Self: { DNSName: "capycode.tail123.ts.net." } })),
    ).toBe("capycode.tail123.ts.net");
  });

  it("resolves the tailscale-ip host alias", async () => {
    const runner = vi.fn(() =>
      Effect.succeed({
        stdout: "100.88.10.4\n",
        stderr: "",
      }),
    );

    await expect(Effect.runPromise(resolveInstallHost("tailscale-ip", runner))).resolves.toBe(
      "100.88.10.4",
    );
    expect(runner).toHaveBeenCalledWith({
      command: "tailscale",
      args: ["ip", "-4"],
    });
  });

  it("resolves the tailscale-hostname host alias", async () => {
    const runner = vi.fn(() =>
      Effect.succeed({
        stdout: JSON.stringify({ Self: { DNSName: "capycode.tail123.ts.net." } }),
        stderr: "",
      }),
    );

    await expect(
      Effect.runPromise(resolveInstallHost("tailscale-hostname", runner)),
    ).resolves.toBe("capycode.tail123.ts.net");
    expect(runner).toHaveBeenCalledWith({
      command: "tailscale",
      args: ["status", "--json"],
    });
  });

  it("defaults to the tailscale hostname when available", async () => {
    const runner = vi.fn((input: { readonly args: ReadonlyArray<string> }) =>
      Effect.succeed({
        stdout:
          input.args[0] === "status"
            ? JSON.stringify({ Self: { DNSName: "capycode.tail123.ts.net." } })
            : "",
        stderr: "",
      }),
    );

    await expect(Effect.runPromise(resolveInstallHost("auto", runner))).resolves.toBe(
      "capycode.tail123.ts.net",
    );
  });

  it("falls back to loopback when tailscale is unavailable", async () => {
    const runner = vi.fn((input) =>
      Effect.succeed({
        stdout: input.args[0] === "status" ? "{\"Self\":{}}" : "",
        stderr: "",
      }),
    );

    await expect(Effect.runPromise(resolveInstallHost("auto", runner))).resolves.toBe(
      "127.0.0.1",
    );
  });
});
