import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOGIN_URL = "https://www.blablalink.com/";
const USER_INFO_URL =
  "https://api.blablalink.com/api/ugc/proxy/standalonesite/User/GetUserInfoNew";
const COOKIE_URLS = [LOGIN_URL, "https://api.blablalink.com/"];
const PROJECT_REF = "anykpqefclgavqqijvmd";
const DEFAULT_CDP_PORT = 9223;
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const LOGIN_POLL_INTERVAL_MS = 2_000;
const CDP_START_TIMEOUT_MS = 20_000;
const CDP_COMMAND_TIMEOUT_MS = 12_000;
const MAX_WEBSOCKET_PAYLOAD_BYTES = 32 * 1024 * 1024;
const SECRET_FILE_PREFIX = "nikkeuraid-blabla-secret-";
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const EDGE_PROFILE_DIRECTORY = join(
  REPOSITORY_ROOT,
  ".runlogs",
  "blablalink-edge-profile",
);

const SAFE_MESSAGES = Object.freeze({
  browser:
    "Microsoft Edge 자동화 연결에 실패했습니다. Edge를 닫고 다시 실행해 주세요.",
  cli: "Supabase secret 갱신에 실패했습니다. CLI 로그인 상태와 네트워크를 확인해 주세요.",
  cookies:
    "유효한 BlablaLink 로그인 쿠키를 찾지 못했습니다. 다시 로그인해 주세요.",
  edge: "Microsoft Edge를 찾지 못했습니다.",
  generic: "BlablaLink 세션 갱신에 실패했습니다.",
  login: "5분 안에 BlablaLink 로그인이 확인되지 않았습니다. 다시 실행해 주세요.",
  platform: "이 명령은 Windows의 Microsoft Edge에서만 실행할 수 있습니다.",
  port: "CDP 포트는 1~65535 범위의 정수여야 합니다.",
});

class SafeSessionUpdateError extends Error {
  constructor(code) {
    super(SAFE_MESSAGES[code] ?? SAFE_MESSAGES.generic);
    this.name = "SafeSessionUpdateError";
    this.code = code;
  }
}

export function safeErrorMessage(error) {
  if (
    error instanceof SafeSessionUpdateError &&
    Object.hasOwn(SAFE_MESSAGES, error.code)
  ) {
    return SAFE_MESSAGES[error.code];
  }

  return SAFE_MESSAGES.generic;
}

export function parseCdpPort(rawValue) {
  if (rawValue === undefined || String(rawValue).trim() === "") {
    return DEFAULT_CDP_PORT;
  }

  const port = Number(rawValue);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new SafeSessionUpdateError("port");
  }

  return port;
}

function isBlablaLinkDomain(domain) {
  if (typeof domain !== "string") return false;
  const normalized = domain.trim().replace(/^\./, "").toLowerCase();
  return (
    normalized === "blablalink.com" || normalized.endsWith(".blablalink.com")
  );
}

function hasSafeCookieName(name) {
  return (
    typeof name === "string" &&
    /^game_[A-Za-z0-9_.-]+$/.test(name)
  );
}

function hasSafeCookieValue(value) {
  return (
    typeof value === "string" &&
    /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/.test(value)
  );
}

export function selectValidGameCookies(cookies, nowSeconds = Date.now() / 1000) {
  if (!Array.isArray(cookies)) return [];

  return cookies
    .filter((cookie) => {
      if (!cookie || typeof cookie !== "object") return false;

      const expires = Number(cookie.expires);
      const isUnexpired =
        Number.isFinite(expires) && (expires <= 0 || expires > nowSeconds);

      return (
        cookie.httpOnly === true &&
        isBlablaLinkDomain(cookie.domain) &&
        hasSafeCookieName(cookie.name) &&
        hasSafeCookieValue(cookie.value) &&
        isUnexpired
      );
    })
    .sort((left, right) => {
      const byName = left.name.localeCompare(right.name);
      if (byName !== 0) return byName;

      const byDomain = left.domain.localeCompare(right.domain);
      if (byDomain !== 0) return byDomain;

      return String(right.path ?? "").length - String(left.path ?? "").length;
    });
}

export function buildCookieHeader(cookies) {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    throw new SafeSessionUpdateError("cookies");
  }

  for (const cookie of cookies) {
    if (
      !cookie ||
      !hasSafeCookieName(cookie.name) ||
      !hasSafeCookieValue(cookie.value)
    ) {
      throw new SafeSessionUpdateError("cookies");
    }
  }

  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

export function earliestCookieExpiry(cookies) {
  const expiries = cookies
    .map((cookie) => Number(cookie.expires))
    .filter(
      (expiry) =>
        Number.isFinite(expiry) &&
        expiry > 0 &&
        expiry * 1000 <= 8_640_000_000_000_000,
    );

  return expiries.length > 0 ? Math.min(...expiries) : null;
}

export function formatCookieExpiry(expirySeconds) {
  if (expirySeconds === null) return "세션 종료 시";
  return new Date(expirySeconds * 1000).toISOString();
}

export function createSupabaseSecretInvocation(
  secretFilePath,
  environment = process.env,
) {
  if (
    typeof secretFilePath !== "string" ||
    secretFilePath.length === 0 ||
    /[\r\n"]/.test(secretFilePath)
  ) {
    throw new SafeSessionUpdateError("cli");
  }

  const commandLine =
    `npx.cmd --yes supabase@latest secrets set --project-ref ${PROJECT_REF} ` +
    `--env-file "${secretFilePath}"`;

  return {
    command: environment.ComSpec || environment.COMSPEC || "cmd.exe",
    args: ["/d", "/s", "/v:off", "/c", commandLine],
    options: {
      env: {
        ...environment,
        NO_UPDATE_NOTIFIER: "1",
        npm_config_loglevel: "silent",
        npm_config_logs_max: "0",
        npm_config_update_notifier: "false",
      },
      shell: false,
      stdio: "ignore",
      windowsVerbatimArguments: true,
      windowsHide: true,
    },
  };
}

export async function runSupabaseSecretUpdate(
  cookieHeader,
  {
    environment = process.env,
    spawnProcess = spawn,
  } = {},
) {
  if (
    typeof cookieHeader !== "string" ||
    cookieHeader.length === 0 ||
    /[\r\n"\\]/.test(cookieHeader)
  ) {
    throw new SafeSessionUpdateError("cookies");
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), SECRET_FILE_PREFIX));
  const secretFilePath = join(temporaryDirectory, "session.env");

  try {
    await writeFile(secretFilePath, `BLABLA_COOKIE="${cookieHeader}"\r\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    const invocation = createSupabaseSecretInvocation(secretFilePath, environment);

    await new Promise((resolvePromise, rejectPromise) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        if (error) rejectPromise(error);
        else resolvePromise();
      };

      let child;
      try {
        child = spawnProcess(
          invocation.command,
          invocation.args,
          invocation.options,
        );
      } catch {
        finish(new SafeSessionUpdateError("cli"));
        return;
      }

      child.once("error", () => finish(new SafeSessionUpdateError("cli")));
      child.once("exit", (code) => {
        finish(code === 0 ? undefined : new SafeSessionUpdateError("cli"));
      });
    });
  } finally {
    try {
      await rm(temporaryDirectory, { recursive: true, force: true });
    } catch {
      throw new SafeSessionUpdateError("cli");
    }
  }
}

function edgeExecutableCandidates(environment = process.env) {
  const candidates = [];
  const append = (baseDirectory) => {
    if (!baseDirectory) return;
    candidates.push(
      join(baseDirectory, "Microsoft", "Edge", "Application", "msedge.exe"),
    );
  };

  if (environment.MSEDGE_PATH) candidates.push(environment.MSEDGE_PATH);
  append(environment["PROGRAMFILES(X86)"]);
  append(environment.PROGRAMFILES);
  append(environment.LOCALAPPDATA);
  append("C:\\Program Files (x86)");
  append("C:\\Program Files");

  return [...new Set(candidates.map((candidate) => resolve(candidate)))];
}

function findEdgeExecutable(environment) {
  const executable = edgeExecutableCandidates(environment).find((candidate) =>
    existsSync(candidate),
  );

  if (!executable) throw new SafeSessionUpdateError("edge");
  return executable;
}

function launchEdge(executable, port, profileDirectory) {
  let child;
  try {
    child = spawn(
      executable,
      [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDirectory}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-mode",
        "--new-window",
        LOGIN_URL,
      ],
      {
        detached: false,
        stdio: "ignore",
        windowsHide: false,
      },
    );
  } catch {
    throw new SafeSessionUpdateError("browser");
  }

  const state = { failed: false, exited: false };
  child.once("error", () => {
    state.failed = true;
  });
  child.once("exit", () => {
    state.exited = true;
  });

  return { child, state };
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}

async function requestCdpJson(port, pathname, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 2_000);

  try {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method: options.method ?? "GET",
      signal: controller.signal,
    });
    if (!response.ok) throw new SafeSessionUpdateError("browser");
    return await response.json();
  } catch {
    throw new SafeSessionUpdateError("browser");
  } finally {
    clearTimeout(timeout);
  }
}

async function tryReadCdpVersion(port, timeoutMs = 500) {
  try {
    const version = await requestCdpJson(port, "/json/version", { timeoutMs });
    if (
      !version ||
      typeof version.webSocketDebuggerUrl !== "string" ||
      !String(version.Browser ?? "").includes("Edg/")
    ) {
      return null;
    }
    return version;
  } catch {
    return null;
  }
}

async function waitForCdpVersion(port, launchState) {
  const deadline = Date.now() + CDP_START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (launchState.failed || launchState.exited) {
      throw new SafeSessionUpdateError("browser");
    }

    const version = await tryReadCdpVersion(port);
    if (version) return version;
    await delay(250);
  }

  throw new SafeSessionUpdateError("browser");
}

async function findPageTarget(port) {
  let targets;
  try {
    targets = await requestCdpJson(port, "/json/list");
  } catch {
    targets = [];
  }

  if (Array.isArray(targets)) {
    const pageTargets = targets.filter(
      (target) =>
        target?.type === "page" &&
        typeof target.webSocketDebuggerUrl === "string",
    );
    const blablaTarget = pageTargets.find((target) => {
      try {
        return new URL(target.url).hostname.endsWith("blablalink.com");
      } catch {
        return false;
      }
    });

    if (blablaTarget) return blablaTarget;
    if (pageTargets[0]) return pageTargets[0];
  }

  const created = await requestCdpJson(
    port,
    `/json/new?${encodeURIComponent(LOGIN_URL)}`,
    { method: "PUT" },
  );
  if (created?.type !== "page" || typeof created.webSocketDebuggerUrl !== "string") {
    throw new SafeSessionUpdateError("browser");
  }
  return created;
}

function encodeWebSocketFrame(payloadInput, opcode = 0x1) {
  const payload = Buffer.isBuffer(payloadInput)
    ? payloadInput
    : Buffer.from(payloadInput, "utf8");
  const mask = randomBytes(4);
  let header;

  if (payload.length < 126) {
    header = Buffer.allocUnsafe(2);
    header[1] = 0x80 | payload.length;
  } else if (payload.length <= 65_535) {
    header = Buffer.allocUnsafe(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }

  header[0] = 0x80 | opcode;
  const maskedPayload = Buffer.allocUnsafe(payload.length);
  for (let index = 0; index < payload.length; index += 1) {
    maskedPayload[index] = payload[index] ^ mask[index % mask.length];
  }

  return Buffer.concat([header, mask, maskedPayload]);
}

function readWebSocketFrame(buffer) {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const secondByte = buffer[1];
  const fin = (firstByte & 0x80) !== 0;
  const opcode = firstByte & 0x0f;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < offset + 2) return null;
    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) return null;
    const longLength = buffer.readBigUInt64BE(offset);
    if (longLength > BigInt(MAX_WEBSOCKET_PAYLOAD_BYTES)) {
      throw new SafeSessionUpdateError("browser");
    }
    payloadLength = Number(longLength);
    offset += 8;
  }

  if (payloadLength > MAX_WEBSOCKET_PAYLOAD_BYTES) {
    throw new SafeSessionUpdateError("browser");
  }

  let mask;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    mask = buffer.subarray(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + payloadLength) return null;
  const payload = Buffer.from(buffer.subarray(offset, offset + payloadLength));
  if (mask) {
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= mask[index % mask.length];
    }
  }

  return {
    fin,
    opcode,
    payload,
    rest: buffer.subarray(offset + payloadLength),
  };
}

class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.fragmentOpcode = null;
    this.fragmentPayloads = [];
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;

    socket.on("data", (chunk) => this.acceptChunk(chunk));
    socket.once("error", () => this.fail());
    socket.once("close", () => this.fail());
  }

  acceptChunk(chunk) {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);

    try {
      while (true) {
        const frame = readWebSocketFrame(this.buffer);
        if (!frame) return;
        this.buffer = frame.rest;
        this.acceptFrame(frame);
      }
    } catch {
      this.fail();
    }
  }

  acceptFrame(frame) {
    if (frame.opcode === 0x8) {
      this.fail();
      return;
    }
    if (frame.opcode === 0x9) {
      if (!this.socket.destroyed) {
        this.socket.write(encodeWebSocketFrame(frame.payload, 0x0a));
      }
      return;
    }
    if (frame.opcode === 0x0a) return;

    if (frame.opcode === 0x0) {
      if (this.fragmentOpcode === null) {
        this.fail();
        return;
      }
      this.fragmentPayloads.push(frame.payload);
      if (frame.fin) {
        const opcode = this.fragmentOpcode;
        const payload = Buffer.concat(this.fragmentPayloads);
        this.fragmentOpcode = null;
        this.fragmentPayloads = [];
        this.acceptMessage(opcode, payload);
      }
      return;
    }

    if (frame.opcode !== 0x1) {
      this.fail();
      return;
    }
    if (!frame.fin) {
      this.fragmentOpcode = frame.opcode;
      this.fragmentPayloads = [frame.payload];
      return;
    }
    this.acceptMessage(frame.opcode, frame.payload);
  }

  acceptMessage(opcode, payload) {
    if (opcode !== 0x1) return;

    let message;
    try {
      message = JSON.parse(payload.toString("utf8"));
    } catch {
      this.fail();
      return;
    }

    if (!Number.isInteger(message?.id)) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;

    this.pending.delete(message.id);
    clearTimeout(pending.timeout);
    if (message.error) pending.reject(new SafeSessionUpdateError("browser"));
    else pending.resolve(message.result ?? {});
  }

  send(method, params = {}, timeoutMs = CDP_COMMAND_TIMEOUT_MS) {
    if (this.closed) {
      return Promise.reject(new SafeSessionUpdateError("browser"));
    }

    const id = this.nextId;
    this.nextId += 1;

    return new Promise((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new SafeSessionUpdateError("browser"));
      }, timeoutMs);
      this.pending.set(id, {
        reject: rejectPromise,
        resolve: resolvePromise,
        timeout,
      });

      try {
        this.socket.write(
          encodeWebSocketFrame(JSON.stringify({ id, method, params })),
        );
      } catch {
        clearTimeout(timeout);
        this.pending.delete(id);
        rejectPromise(new SafeSessionUpdateError("browser"));
      }
    });
  }

  fail() {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new SafeSessionUpdateError("browser"));
    }
    this.pending.clear();
    if (!this.socket.destroyed) this.socket.destroy();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new SafeSessionUpdateError("browser"));
    }
    this.pending.clear();
    if (!this.socket.destroyed) {
      this.socket.end(encodeWebSocketFrame(Buffer.alloc(0), 0x08));
    }
  }
}

function validateLocalWebSocketUrl(webSocketUrl, expectedPort) {
  let parsed;
  try {
    parsed = new URL(webSocketUrl);
  } catch {
    throw new SafeSessionUpdateError("browser");
  }

  const isLoopback = ["127.0.0.1", "localhost", "[::1]"].includes(
    parsed.hostname.toLowerCase(),
  );
  if (
    parsed.protocol !== "ws:" ||
    !isLoopback ||
    Number(parsed.port) !== expectedPort
  ) {
    throw new SafeSessionUpdateError("browser");
  }

  return parsed;
}

async function openWebSocket(webSocketUrl, expectedPort) {
  const parsed = validateLocalWebSocketUrl(webSocketUrl, expectedPort);
  const key = randomBytes(16).toString("base64");
  const expectedAccept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  return await new Promise((resolvePromise, rejectPromise) => {
    const socket = net.createConnection({
      host: parsed.hostname.replace(/^\[|\]$/g, ""),
      port: Number(parsed.port),
    });
    socket.setNoDelay(true);

    let settled = false;
    let handshakeBuffer = Buffer.alloc(0);
    const timeout = setTimeout(() => fail(), 5_000);

    const cleanupHandshake = () => {
      clearTimeout(timeout);
      socket.removeListener("error", fail);
      socket.removeListener("data", onData);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      cleanupHandshake();
      socket.destroy();
      rejectPromise(new SafeSessionUpdateError("browser"));
    };
    const onData = (chunk) => {
      if (settled) return;
      handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
      if (handshakeBuffer.length > 32_768) {
        fail();
        return;
      }

      const headerEnd = handshakeBuffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;

      const headerText = handshakeBuffer.subarray(0, headerEnd).toString("ascii");
      const headerLines = headerText.split("\r\n");
      const statusLine = headerLines.shift() ?? "";
      const headers = new Map();
      for (const line of headerLines) {
        const separator = line.indexOf(":");
        if (separator <= 0) continue;
        headers.set(
          line.slice(0, separator).trim().toLowerCase(),
          line.slice(separator + 1).trim(),
        );
      }

      if (
        !/^HTTP\/1\.1 101\b/.test(statusLine) ||
        headers.get("sec-websocket-accept") !== expectedAccept
      ) {
        fail();
        return;
      }

      settled = true;
      socket.pause();
      cleanupHandshake();
      const connection = new CdpConnection(socket);
      const remaining = handshakeBuffer.subarray(headerEnd + 4);
      if (remaining.length > 0) connection.acceptChunk(remaining);
      socket.resume();
      resolvePromise(connection);
    };

    socket.once("error", fail);
    socket.on("data", onData);
    socket.once("connect", () => {
      const requestPath = `${parsed.pathname}${parsed.search}`;
      socket.write(
        [
          `GET ${requestPath} HTTP/1.1`,
          `Host: ${parsed.host}`,
          "Connection: Upgrade",
          "Upgrade: websocket",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          "",
          "",
        ].join("\r\n"),
      );
    });
  });
}

const LOGIN_PROBE_EXPRESSION = `
(async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(${JSON.stringify(USER_INFO_URL)}, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-channel-type": "2",
        "x-language": "ko",
        "x-common-params": ${JSON.stringify(
          JSON.stringify({
            game_id: "16",
            area_id: "global",
            source: "pc_web",
            intl_game_id: "29080",
            language: "ko",
            env: "prod",
            data_statistics_scene: "outer",
            data_statistics_page_id: LOGIN_URL,
            data_statistics_client_type: "pc_web",
            data_statistics_lang: "ko",
          }),
        )}
      },
      body: "{}",
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) return false;
    const payload = await response.json();
    const openId = payload?.data?.info?.intl_openid;
    return String(payload?.code) === "0" &&
      typeof openId === "string" && openId.trim().length > 0;
  } catch {
    return false;
  }
})()
`;

async function isLoggedIn(connection) {
  try {
    const result = await connection.send("Runtime.evaluate", {
      expression: LOGIN_PROBE_EXPRESSION,
      awaitPromise: true,
      returnByValue: true,
    });
    return result?.result?.value === true;
  } catch {
    if (connection.closed) throw new SafeSessionUpdateError("browser");
    return false;
  }
}

async function waitForLogin(connection, logger) {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  let announced = false;

  while (true) {
    if (await isLoggedIn(connection)) return;

    if (!announced) {
      logger.log("열린 Edge 창에서 BlablaLink 로그인을 완료해 주세요 (최대 5분).");
      announced = true;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new SafeSessionUpdateError("login");
    await delay(Math.min(LOGIN_POLL_INTERVAL_MS, remaining));
  }
}

async function closeLaunchedEdge(connection, launchedEdge) {
  if (connection && !connection.closed) {
    try {
      await connection.send("Browser.close", {}, 1_500);
    } catch {
      // The browser normally closes the socket before acknowledging this command.
    }
    connection.close();
  }

  if (launchedEdge && !launchedEdge.child.killed) {
    try {
      launchedEdge.child.kill();
    } catch {
      // Best-effort cleanup; no process details are surfaced.
    }
  }
}

export async function updateBlablaLinkSession({
  environment = process.env,
  logger = console,
  platform = process.platform,
} = {}) {
  if (platform !== "win32") throw new SafeSessionUpdateError("platform");

  const port = parseCdpPort(environment.BLABLA_CDP_PORT);
  let launchedEdge = null;
  let connection = null;

  try {
    let cdpVersion = await tryReadCdpVersion(port);
    if (!cdpVersion) {
      await mkdir(EDGE_PROFILE_DIRECTORY, { recursive: true });
      launchedEdge = launchEdge(
        findEdgeExecutable(environment),
        port,
        EDGE_PROFILE_DIRECTORY,
      );
      cdpVersion = await waitForCdpVersion(port, launchedEdge.state);
    }

    const target = await findPageTarget(port);
    connection = await openWebSocket(target.webSocketDebuggerUrl, port);
    await connection.send("Page.enable");
    await connection.send("Page.navigate", { url: LOGIN_URL });
    await waitForLogin(connection, logger);

    const cookieResult = await connection.send("Network.getCookies", {
      urls: COOKIE_URLS,
    });
    const cookies = selectValidGameCookies(cookieResult.cookies);
    const cookieHeader = buildCookieHeader(cookies);
    const earliestExpiry = earliestCookieExpiry(cookies);

    await runSupabaseSecretUpdate(cookieHeader, { environment });
    logger.log(
      `쿠키 ${cookies.length}개, 가장 이른 만료 ${formatCookieExpiry(earliestExpiry)}`,
    );
  } finally {
    if (launchedEdge) await closeLaunchedEdge(connection, launchedEdge);
    else if (connection) connection.close();
  }
}

function isExecutedDirectly() {
  if (!process.argv[1]) return false;
  const invoked = resolve(process.argv[1]);
  const current = fileURLToPath(import.meta.url);
  return process.platform === "win32"
    ? invoked.toLowerCase() === current.toLowerCase()
    : invoked === current;
}

if (isExecutedDirectly()) {
  updateBlablaLinkSession().catch((error) => {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}
