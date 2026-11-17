import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

/**
 * @param {string} specifier
 * @param {{ parentURL?: string; [key: string]: any }} context
 * @param {(specifier: string, context: any) => Promise<any>} nextResolve
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && specifier.endsWith(".js")) {
    const parentUrl = context.parentURL;
    if (parentUrl?.startsWith("file:")) {
      const targetTs = `${specifier.slice(0, -3)}.ts`;
      const resolvedTarget = new URL(targetTs, parentUrl);
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

/**
 * @param {string} url
 * @param {any} context
 * @param {(url: string, context: any) => Promise<any>} nextLoad
 */
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
