#!/usr/bin/env node
/**
 * Copies Monaco's prebuilt editor (monaco-editor/min/vs) into public/monaco, so
 * the command script editor is served from this site instead of a third-party
 * CDN. Runs after every install; the copy is not committed.
 */

import { cp, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve("monaco-editor/package.json"));
const source = path.join(root, "min", "vs");
const target = path.join(import.meta.dirname, "..", "public", "monaco", "vs");

await stat(source);
await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
console.log(`Copied Monaco ${require("monaco-editor/package.json").version} to public/monaco/vs`);
