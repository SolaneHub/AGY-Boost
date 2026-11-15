import fs from "node:fs";
import path from "node:path";

fs.mkdirSync("dist", { recursive: true });
fs.mkdirSync(path.join("src", "cli", "embedded"), { recursive: true });

const src = path.join("src", "client", "dist", "agy-boost.js");
const embeddedDest = path.join("src", "cli", "embedded", "runtime.js");
const distDest = path.join("dist", "agy-boost.js");

fs.copyFileSync(src, embeddedDest);
fs.copyFileSync(src, distDest);
