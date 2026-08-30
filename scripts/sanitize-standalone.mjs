import { rm } from "node:fs/promises";
import { join } from "node:path";

// Next.js intentionally copies root .env and .env.production files into a
// standalone bundle. Runtime secrets must instead come from the deployment
// platform, so remove only those exact generated copies after every build.
const standalone = join(process.cwd(), ".next", "standalone");
await Promise.all([
  rm(join(standalone, ".env"), { force: true }),
  rm(join(standalone, ".env.production"), { force: true }),
]);

console.log("Standalone environment files removed; inject secrets at runtime.");
