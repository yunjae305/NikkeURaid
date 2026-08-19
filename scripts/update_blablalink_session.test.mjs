import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCookieHeader,
  createSupabaseSecretInvocation,
  earliestCookieExpiry,
  formatCookieExpiry,
  parseCdpPort,
  runSupabaseSecretUpdate,
  safeErrorMessage,
  selectValidGameCookies,
} from "./update_blablalink_session.mjs";

const NOW_SECONDS = 1_800_000_000;

test("selectValidGameCookies keeps only unexpired BlablaLink game_* HttpOnly cookies", () => {
  const cookies = selectValidGameCookies(
    [
      {
        name: "game_session",
        value: "safe-value%2Fone",
        domain: ".blablalink.com",
        path: "/",
        httpOnly: true,
        expires: NOW_SECONDS + 600,
      },
      {
        name: "game_session_scoped",
        value: "safe-value-two",
        domain: "api.blablalink.com",
        path: "/api",
        httpOnly: true,
        expires: -1,
      },
      {
        name: "game_expired",
        value: "expired-secret",
        domain: ".blablalink.com",
        httpOnly: true,
        expires: NOW_SECONDS,
      },
      {
        name: "game_visible",
        value: "visible-secret",
        domain: ".blablalink.com",
        httpOnly: false,
        expires: NOW_SECONDS + 600,
      },
      {
        name: "analytics",
        value: "not-a-game-cookie",
        domain: ".blablalink.com",
        httpOnly: true,
        expires: NOW_SECONDS + 600,
      },
      {
        name: "game_foreign",
        value: "foreign-secret",
        domain: ".example.com",
        httpOnly: true,
        expires: NOW_SECONDS + 600,
      },
      {
        name: "game_unsafe",
        value: "unsafe\r\nvalue",
        domain: ".blablalink.com",
        httpOnly: true,
        expires: NOW_SECONDS + 600,
      },
    ],
    NOW_SECONDS,
  );

  assert.deepEqual(
    cookies.map((cookie) => cookie.name),
    ["game_session", "game_session_scoped"],
  );
  assert.equal(
    buildCookieHeader(cookies),
    "game_session=safe-value%2Fone; game_session_scoped=safe-value-two",
  );
});

test("earliestCookieExpiry reports only the earliest finite expiry", () => {
  const expiry = earliestCookieExpiry([
    { expires: -1 },
    { expires: NOW_SECONDS + 900 },
    { expires: NOW_SECONDS + 300 },
  ]);

  assert.equal(expiry, NOW_SECONDS + 300);
  assert.equal(
    formatCookieExpiry(expiry),
    new Date((NOW_SECONDS + 300) * 1000).toISOString(),
  );
  assert.equal(formatCookieExpiry(null), "세션 종료 시");
});

test("the Supabase command accepts only a secret file path", () => {
  const cookieHeader = "game_session=DO_NOT_EXPOSE%2FVALUE";
  const secretFilePath = "C:\\Temp\\nikkeuraid-secret\\session.env";
  const invocation = createSupabaseSecretInvocation(secretFilePath, {
    ComSpec: "cmd.exe",
    PATH: "C:\\Windows\\System32",
  });

  assert.equal(invocation.command, "cmd.exe");
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.stdio, "ignore");
  assert.equal(invocation.options.windowsVerbatimArguments, true);
  assert.equal(invocation.options.windowsHide, true);
  assert.equal(invocation.options.env.npm_config_loglevel, "silent");
  assert.equal(invocation.options.env.npm_config_logs_max, "0");
  assert.doesNotMatch(invocation.args.join(" "), /DO_NOT_EXPOSE/);
  assert.match(invocation.args.at(-1), /npx\.cmd --yes supabase@latest/);
  assert.match(invocation.args.at(-1), /--env-file/);
  assert.match(invocation.args.at(-1), /session\.env/);
  assert.ok(!Object.values(invocation.options.env).includes(cookieHeader));
});

test("the running Supabase process never receives the cookie in its arguments", async () => {
  const cookieHeader = "game_session=DO_NOT_EXPOSE_PROCESS_VALUE";
  let secretFilePath;
  const spawnProcess = (_command, args, options) => {
    const commandLine = args.at(-1);
    const match = commandLine.match(/--env-file "([^"]+)"/);
    assert.ok(match);
    secretFilePath = match[1];

    assert.doesNotMatch(args.join(" "), /DO_NOT_EXPOSE_PROCESS_VALUE/);
    assert.ok(
      !Object.values(options.env).some((value) =>
        String(value).includes("DO_NOT_EXPOSE_PROCESS_VALUE")
      ),
    );
    assert.match(
      readFileSync(secretFilePath, "utf8"),
      /DO_NOT_EXPOSE_PROCESS_VALUE/,
    );

    const child = new EventEmitter();
    queueMicrotask(() => child.emit("exit", 0));
    return child;
  };

  await runSupabaseSecretUpdate(cookieHeader, {
    environment: { ComSpec: "cmd.exe" },
    spawnProcess,
  });

  assert.equal(existsSync(secretFilePath), false);
});

test("a failed Supabase CLI call exposes only a generic error", async () => {
  const cookieHeader = "game_session=DO_NOT_EXPOSE_FAILURE_VALUE";
  let captured;
  const spawnProcess = (command, args, options) => {
    captured = {
      command,
      args: [...args],
      options: { ...options, env: { ...options.env } },
    };
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("exit", 9));
    return child;
  };

  await assert.rejects(
    runSupabaseSecretUpdate(cookieHeader, {
      environment: { ComSpec: "cmd.exe" },
      spawnProcess,
    }),
    (error) => {
      assert.equal(
        safeErrorMessage(error),
        "Supabase secret 갱신에 실패했습니다. CLI 로그인 상태와 네트워크를 확인해 주세요.",
      );
      assert.doesNotMatch(String(error), /DO_NOT_EXPOSE_FAILURE_VALUE/);
      return true;
    },
  );

  assert.doesNotMatch(captured.args.join(" "), /DO_NOT_EXPOSE_FAILURE_VALUE/);
  assert.ok(
    !Object.values(captured.options.env).some((value) =>
      String(value).includes("DO_NOT_EXPOSE_FAILURE_VALUE")
    ),
  );
  assert.equal(captured.options.stdio, "ignore");
});

test("unexpected errors and invalid ports are safely normalized", () => {
  assert.equal(parseCdpPort(undefined), 9223);
  assert.equal(parseCdpPort("9444"), 9444);
  assert.throws(() => parseCdpPort("0"));

  const secretMarker = "DO_NOT_EXPOSE_UNEXPECTED_VALUE";
  assert.equal(
    safeErrorMessage(new Error(secretMarker)),
    "BlablaLink 세션 갱신에 실패했습니다.",
  );
  assert.doesNotMatch(
    safeErrorMessage(new Error(secretMarker)),
    /DO_NOT_EXPOSE_UNEXPECTED_VALUE/,
  );
});
