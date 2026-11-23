import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { repoPath } from "./helpers/load.mjs";

for (const file of ["app.js", "sw.js", "admin/admin.js", "cron/worker.js", "functions/api/image.js"]) {
  test(`${file} parses`, () => {
    assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", repoPath(file)], { stdio: "pipe" }));
  });
}
