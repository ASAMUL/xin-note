/**
 * 将任意值转换为可通过 Electron IPC 结构化克隆的 JSON 安全值。
 * - 处理 BigInt / Date / Error / TypedArray / ArrayBuffer
 * - 处理循环引用
 * - 过滤 function / symbol
 */
export function toJsonSafeValue<T = unknown>(value: T): unknown {
  const seen = new WeakSet<object>();

  const replacer = (_key: string, current: unknown) => {
    if (typeof current === 'bigint') return current.toString();
    if (typeof current === 'function' || typeof current === 'symbol') return undefined;

    if (current instanceof Date) return current.toISOString();
    if (current instanceof Error) {
      return {
        name: current.name,
        message: current.message,
        stack: current.stack,
      };
    }

    if (ArrayBuffer.isView(current)) {
      return Array.from(current as any);
    }

    if (current instanceof ArrayBuffer) {
      return Array.from(new Uint8Array(current));
    }

    if (current && typeof current === 'object') {
      if (seen.has(current as object)) return '[Circular]';
      seen.add(current as object);
    }

    return current;
  };

  const serialized = JSON.stringify(value, replacer);
  if (serialized === undefined) return null;
  return JSON.parse(serialized);
}
