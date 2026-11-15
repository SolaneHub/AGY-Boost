import { spawnSync } from "node:child_process";
import process from "node:process";

console.log("Typechecking Go packages and tests ('go test -run=^$ ./...')...");
const result = spawnSync("go", ["test", "-run=^$", "./..."], { stdio: "inherit" });
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
console.log("Go typecheck passed.");
