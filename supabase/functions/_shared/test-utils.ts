interface DenoTestRuntime {
  test(name: string, fn: () => void | Promise<void>): void;
}

const deno = (globalThis as typeof globalThis & { Deno: DenoTestRuntime }).Deno;

export function test(name: string, fn: () => void | Promise<void>): void {
  deno.test(name, fn);
}

export function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertEquals<T>(
  actual: T,
  expected: T,
  message = "values are not equal",
): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}: ${left} !== ${right}`);
}

export async function assertRejects(
  action: () => unknown | Promise<unknown>,
  predicate: (error: unknown) => boolean,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (!predicate(error)) throw new Error("rejection did not match predicate");
    return;
  }
  throw new Error("expected action to reject");
}
