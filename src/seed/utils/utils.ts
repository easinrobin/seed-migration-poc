import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { TableName, TABLE_REGISTRY } from "../config/tableRegistry";

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

  // Array merge: merge items by ID
  if (Array.isArray(base) && Array.isArray(override)) {
    const map = new Map<string, any>();

    // Add base items first
    for (const b of base) {
      if (b?.id) map.set(b.id, b);
    }

    // Apply overrides (deep-merge item-by-item)
    for (const o of override) {
      if (o?.id) {
        const existing = map.get(o.id);
        map.set(o.id, deepMerge(existing || {}, o));
      }
    }

    return Array.from(map.values());
  }

  // Object merge (recursive)
  if (isPlainObject(base) && isPlainObject(override)) {
    const res: any = { ...base };
    for (const key of Object.keys(override)) {
      res[key] = deepMerge(base[key], override[key]);
    }
    return res;
  }

  // Primitive or incompatible types → override takes precedence
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
  baseJsonFilePath: string,
  env?: string
): Promise<T> {
  const base = await readJsonFile<T>(baseJsonFilePath).catch((e) => {
    throw new Error(`Cannot load ${baseJsonFilePath}: ${String(e)}`);
  });
  const fileName = readFileName(baseJsonFilePath);

  if (!env) return base;
  const overridePath = path.normalize(
    path.join(
      __dirname,
      "..",
      "..",
      "seed",
      "seed-data",
      "generated",
      "env-overrides",
      env,
      fileName
    )
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

export function generateUUID() {
  return crypto.randomUUID();
}

export function deepCompare(a: any, b: any): boolean {
  const clean = (obj: any) => {
    if (!obj) return obj;
    const { createdAt, updatedAt, ...rest } = obj;
    return rest;
  };

  return JSON.stringify(clean(a)) === JSON.stringify(clean(b));
}

export function buildDependencyGraph(): Record<TableName, TableName[]> {
  const graph: Record<TableName, TableName[]> = {} as any;
  const tables = Object.keys(TABLE_REGISTRY) as TableName[];

  // Initialize empty lists
  for (const table of tables) {
    graph[table] = [];
  }

  for (const table of tables) {
    const refs = TABLE_REGISTRY[table].references || [];

    for (const ref of refs) {
      const parentTable = ref.references.table as TableName;
      // Add edge parent → table
      graph[parentTable].push(table);
    }
  }

  return graph;
}

export function topologicalSort(
  graph: Record<TableName, TableName[]>
): TableName[] {
  const tables = Object.keys(graph) as TableName[];

  // Compute in-degree for each table
  const inDegree: Record<TableName, number> = {} as Record<TableName, number>;
  tables.forEach((t) => (inDegree[t] = 0));
  tables.forEach((parent) => {
    graph[parent].forEach((child) => {
      inDegree[child] = (inDegree[child] || 0) + 1;
    });
  });

  // Start with nodes that have in-degree 0
  const queue: TableName[] = tables.filter((t) => inDegree[t] === 0);
  const order: TableName[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    // Visit all children of current
    for (const child of graph[current]) {
      inDegree[child]--;
      if (inDegree[child] === 0) {
        queue.push(child);
      }
    }
  }

  if (order.length !== tables.length) {
    const remaining = tables.filter((t) => !order.includes(t));
    throw new Error(
      `⚠️ Cycle detected in foreign key dependencies! Remaining tables: ${remaining.join(
        ", "
      )}`
    );
  }

  return order;
}

export function toCamelCase(str: string) {
  if (!str) return "";
  return str.charAt(0).toLowerCase() + str.slice(1);
}

export function toCapitalize(str: string) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function toDirName(str: string) {
  if (!str) return "";
  return str.split(" ").join("-").toLowerCase();
}

export function camelToSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function toSnakeCase(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, "_");
}
