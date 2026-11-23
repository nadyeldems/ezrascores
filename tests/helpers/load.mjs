// Test helpers: load internal (non-exported) functions from the API and the
// browser app without changing how those files are deployed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const repoPath = (...parts) => path.join(root, ...parts);

// Copy functions/api/[[route]].js to a temp .mjs that also exports the named helpers.
export async function loadRouteHelpers(names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ezra-route-"));
  const webpushUrl = pathToFileURL(repoPath("functions/_lib/webpush.js")).href;
  let src = fs.readFileSync(repoPath("functions/api/[[route]].js"), "utf8");
  src = src.replace(/from "\.\.\/_lib\/webpush\.js"/, `from "${webpushUrl}"`);
  src += `\nexport { ${names.join(", ")} };\n`;
  const file = path.join(dir, "route.mjs");
  fs.writeFileSync(file, src);
  return import(pathToFileURL(file).href);
}

// Pull standalone top-level functions (and one-line constants they use) out of
// app.js by name (no DOM needed).
export function loadAppFunctions(names, constNames = []) {
  const src = fs.readFileSync(repoPath("app.js"), "utf8");
  const consts = constNames.map((name) => {
    const match = src.match(new RegExp(`^const ${name} = .*;$`, "m"));
    if (!match) throw new Error(`app.js has no one-line const ${name}`);
    return match[0];
  });
  const bodies = names.map((name) => {
    const start = src.search(new RegExp(`^(async )?function ${name}\\(`, "m"));
    if (start < 0) throw new Error(`app.js has no function ${name}`);
    let depth = 0;
    for (let i = src.indexOf("{", start); i < src.length; i += 1) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
    }
    throw new Error(`Unbalanced braces in ${name}`);
  });
  // eslint-disable-next-line no-new-func
  return new Function(`${consts.join("\n")}\n${bodies.join("\n")}\nreturn { ${names.join(", ")} };`)();
}
