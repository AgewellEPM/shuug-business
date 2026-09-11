import { backupWorkspace, restoreWorkspace } from "../src/lib/workspace/backup";
import { dataDirectory } from "../src/lib/connections/vault";
const [operation, source, target] = process.argv.slice(2);
try {
  if (operation === "backup" && source) console.log(JSON.stringify(backupWorkspace(dataDirectory(), source)));
  else if (operation === "restore" && source && target) console.log(JSON.stringify(restoreWorkspace(source, target)));
  else throw new Error("Stop the app and workers first. Usage: npm run workspace:backup -- backup /private/backup-directory OR npm run workspace:backup -- restore /private/backup-directory /new/data-directory");
} catch (e) { console.error(e instanceof Error ? e.message : "Backup operation failed"); process.exitCode = 1; }
