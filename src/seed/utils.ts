// src/seed/utils.ts
import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";

export async function readJsonFile<T = any>(p: string): Promise<T> {
  const content = await fs.readFile(p, "utf8");
  return JSON.parse(content) as T;
}

export function readFileName(filePath: string): string {
  return path.basename(filePath);
}

export function checksumOfString(s: string) {
  return createHash("md5").update(s, "utf8").digest("hex");
}
export async function checksumOfFile(p: string) {
  const s = await fs.readFile(p, "utf8");
  return checksumOfString(s);
}

/**
 * Deep merge base with override; arrays: override wins if provided.
 */
export function deepMerge(base: any, override: any): any {
  if (override === undefined) return base;
  if (Array.isArray(base) && Array.isArray(override)) {
    return override.length ? override : base;
  }
  if (isPlainObject(base) && isPlainObject(override)) {
    const res: any = { ...base };
    for (const k of Object.keys(override)) {
      res[k] = deepMerge(base[k], override[k]);
    }
    return res;
  }
  return override;
}

function isPlainObject(v: any) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Load base JSON and apply env override if exists:
 * base: seed-data/<file>
 * override: seed-data/env/<env>/<file>.override.json
 */
export async function loadWithEnvOverrides<T = any>(
  fileName: string,
  env?: string
): Promise<T> {
  const basePath = path.resolve(process.cwd(), "seed-data", fileName);
  const base = await readJsonFile<T>(basePath).catch((e) => {
    throw new Error(`Cannot load ${basePath}: ${String(e)}`);
  });

  if (!env) return base;
  const overridePath = path.resolve(
    process.cwd(),
    "seed-data",
    "env",
    env,
    fileName.replace(".json", ".override.json")
  );
  try {
    const override = await readJsonFile<any>(overridePath);
    return deepMerge(base, override) as T;
  } catch (err) {
    // no override — OK
    return base;
  }
}

export function isEqual<T>(a: T, b: T): boolean {
  // Handle null and undefined
  if (a === null || b === null) {
    return a === b;
  }

  // Handle primitive types and functions
  if (typeof a !== "object" || typeof b !== "object") {
    return Object.is(a, b); // Handles NaN, -0, +0 correctly
  }

  // Handle Date objects
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Handle RegExp objects
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.toString() === b.toString();
  }

  // Handle Map objects
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !isEqual(value, b.get(key))) {
        return false;
      }
    }
    return true;
  }

  // Handle Set objects
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    const aArr = Array.from(a);
    const bArr = Array.from(b);
    aArr.sort();
    bArr.sort();
    return aArr.every((val, i) => isEqual(val, bArr[i]));
  }

  // Handle Array and plain objects
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, index) => isEqual(val, b[index]));
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    return false; // one is array, other is not
  }

  // Handle plain objects (including avoiding prototype pollution)
  const keysA = Object.keys(a).filter((key) =>
    Object.hasOwnProperty.call(a, key)
  );
  const keysB = Object.keys(b).filter((key) =>
    Object.hasOwnProperty.call(b, key)
  );

  if (keysA.length !== keysB.length) return false;

  // Sort keys for consistent comparison
  keysA.sort();
  keysB.sort();

  // Compare keys first
  if (!isEqual(keysA as any, keysB as any)) return false;

  // Deep compare values
  for (const key of keysA) {
    if (!isEqual((a as any)[key], (b as any)[key])) {
      return false;
    }
  }

  return true;
}

// Usage examples:
const obj1 = {
  name: "John",
  age: 30,
  hobbies: ["reading", "coding"],
  info: { active: true },
};
const obj2 = {
  name: "John",
  age: 30,
  hobbies: ["reading", "coding"],
  info: { active: true },
};

console.log(isEqual(obj1, obj2)); // true

console.log(isEqual(NaN, NaN)); // true
console.log(
  isEqual({ a: new Date("2025-01-01") }, { a: new Date("2025-01-01") })
); // true
console.log(isEqual(/test/gi, /test/gi)); // true

// Works with Maps and Sets
const map1 = new Map([["key", { x: 1 }]]);
const map2 = new Map([["key", { x: 1 }]]);
console.log(isEqual(map1, map2)); // true
