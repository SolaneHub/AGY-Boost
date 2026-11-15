import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && specifier.endsWith(".js")) {
    const parentURL = context.parentURL;
    if (parentURL && parentURL.startsWith("file:")) {
      const targetTs = specifier.slice(0, -3) + ".ts";
      const resolvedTarget = new URL(targetTs, parentURL);
      if (fs.existsSync(fileURLToPath(resolvedTarget))) {
        return {
          format: "typescript",
          url: resolvedTarget.href,
          shortCircuit: true,
        };
      }
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts")) {
    const filePath = fileURLToPath(url);
    const rawSource = fs.readFileSync(filePath, "utf8");
    const { code } = transformSync(rawSource, {
      loader: "ts",
      format: "esm",
      target: "es2022",
      sourcemap: "inline",
      sourcefile: filePath,
    });
    return {
      format: "module",
      source: code,
      shortCircuit: true,
    };
  }

  return nextLoad(url, context);
}
