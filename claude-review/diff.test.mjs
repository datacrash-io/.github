// Run with `node --test` in this directory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isGenerated, splitDiff, fitDiff, omittedBlock, omittedNote } from "./diff.mjs";

const file = (path, lines, { deleted = false } = {}) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ ${deleted ? "/dev/null" : `b/${path}`}\n@@ -1 +1,${lines.length} @@\n${lines.map((l) => `${deleted ? "-" : "+"}${l}`).join("\n")}\n`;

test("lockfiles, bundles, maps and snapshots are generated; sources are not", () => {
  for (const p of ["pnpm-lock.yaml", "a/b/pnpm-lock.yaml", "package-lock.json", "yarn.lock", "go.sum", "Cargo.lock", "uv.lock",
    ".terraform.lock.hcl", "web/app.min.js", "dist/x.js.map", "__snapshots__/a.test.js.snap"]) assert.ok(isGenerated(p), p);
  for (const p of ["package.json", "pnpm-workspace.yaml", "src/lock.ts", "go.mod", "lockfile.md", "src/app.js"]) assert.ok(!isGenerated(p), p);
});

test("splitDiff reads the path and counts, the old path for a deletion", () => {
  const [a, b] = splitDiff(file("src/a.js", ["x", "y"]) + file("old.txt", ["z"], { deleted: true }));
  assert.deepEqual([a.path, a.added, a.removed], ["src/a.js", 2, 0]);
  assert.deepEqual([b.path, b.added, b.removed], ["old.txt", 0, 1]);
});

test("a large lockfile no longer pushes tests and docs out of the diff", () => {
  const lock = file("x/pnpm-lock.yaml", Array.from({ length: 5000 }, (_, i) => `  resolution: {tarball: https://registry.npmjs.org/p${i}.tgz}`));
  const diff = file("src/app.js", ["code"]) + lock + file("test/app.test.js", ["test"]) + file("docs/README.md", ["doc"]);
  const out = fitDiff(diff, 2000);
  assert.ok(!out.truncated);
  for (const p of ["src/app.js", "test/app.test.js", "docs/README.md"]) assert.match(out.diff, new RegExp(p.replace(/\./g, "\\.")));
  assert.doesNotMatch(out.diff, /pnpm-lock/);
  assert.deepEqual(out.omitted, [{ path: "x/pnpm-lock.yaml", reason: "generated", added: 5000, removed: 0 }]);
  assert.deepEqual(out.hosts, ["registry.npmjs.org"]);
});

test("only hosts on added lines of generated files are reported", () => {
  const lock = "diff --git a/yarn.lock b/yarn.lock\n--- a/yarn.lock\n+++ b/yarn.lock\n@@ -1 +1 @@\n-  resolved \"https://old.example/a.tgz\"\n+  resolved \"https://evil.example/a.tgz\"\n";
  assert.deepEqual(fitDiff(lock + file("src/a.js", ["see https://docs.example"]), 10_000).hosts, ["evil.example"]);
});

test("still too long: the largest files are left out whole, never cut mid-file", () => {
  const big = file("src/big.js", Array.from({ length: 300 }, () => "x".repeat(20)));
  const mid = file("src/mid.js", Array.from({ length: 40 }, () => "y".repeat(20)));
  const small = file("test/small.test.js", ["t"]);
  const out = fitDiff(big + mid + small, 1500);
  assert.ok(!out.truncated);
  assert.deepEqual(out.omitted.map((o) => [o.path, o.reason]), [["src/big.js", "size"]]);
  assert.match(out.diff, /src\/mid\.js/);
  assert.match(out.diff, /test\/small\.test\.js/);
  assert.ok(out.diff.length <= 1500);
});

test("one file over the limit on its own is cut and says so", () => {
  const out = fitDiff(file("src/only.js", Array.from({ length: 500 }, () => "z".repeat(20))), 1000);
  assert.equal(out.diff.length, 1000);
  assert.ok(out.truncated);
  assert.deepEqual(out.omitted, []);
});

test("a diff within the limit is unchanged", () => {
  const diff = file("src/a.js", ["a"]) + file("src/b.js", ["b"]);
  assert.deepEqual(fitDiff(diff, 10_000), { diff, omitted: [], hosts: [], truncated: false });
});

test("the prompt block lists what was left out and asks for the size ones to be read", () => {
  assert.equal(omittedBlock({ omitted: [], hosts: [] }), "");
  const text = omittedBlock({ omitted: [
    { path: "pnpm-lock.yaml", reason: "generated", added: 10, removed: 2 },
    { path: "src/big.js", reason: "size", added: 900, removed: 0 },
  ], hosts: ["registry.npmjs.org"] });
  assert.match(text, /- pnpm-lock\.yaml \(\+10 -2\)/);
  assert.match(text, /URL hosts in their added lines: registry\.npmjs\.org/);
  assert.match(text, /- src\/big\.js \(\+900 -0\)/);
  assert.match(text, /Read the ones that matter/);
});

test("the footer note counts both kinds", () => {
  assert.equal(omittedNote({ omitted: [], truncated: false }, 100), "");
  assert.equal(omittedNote({ omitted: [{ reason: "generated" }, { reason: "generated" }, { reason: "size" }], truncated: false }, 100),
    "\n_Left out of the diff: 2 generated file(s) (lockfiles, bundles); 1 file(s) for size, which the reviewer was told to read in the checkout._");
  assert.match(omittedNote({ omitted: [], truncated: true }, 100), /only its first part/);
});
