import cluster from "node:cluster";
import { runPrimary, workerCount } from "./cluster.js";

// Con varios núcleos, este proceso solo reparte el trabajo entre varios procesos del API (ver cluster.ts).
// Con uno solo (desarrollo, o WORKERS=1), es directamente el API.
const workers = workerCount();
if (cluster.isPrimary && workers > 1) runPrimary(workers);
else await import("./server.js");
