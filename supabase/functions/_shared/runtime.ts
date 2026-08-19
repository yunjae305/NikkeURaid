import { configurationError } from "./errors.ts";

interface DenoRuntime {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
}

interface EdgeRuntime {
  waitUntil(promise: Promise<unknown>): void;
}

const globals = globalThis as typeof globalThis & {
  Deno?: DenoRuntime;
  EdgeRuntime?: EdgeRuntime;
};

export function serve(
  handler: (request: Request) => Response | Promise<Response>,
): void {
  if (!globals.Deno) throw configurationError("environment");
  globals.Deno.serve(handler);
}

export function requiredEnvironment(name: string): string {
  const value = globals.Deno?.env.get(name)?.trim();
  if (!value) throw configurationError(name);
  return value;
}

export function optionalEnvironment(name: string): string | undefined {
  return globals.Deno?.env.get(name)?.trim() || undefined;
}

export function defer(promise: Promise<unknown>): boolean {
  if (!globals.EdgeRuntime) return false;
  globals.EdgeRuntime.waitUntil(promise);
  return true;
}
