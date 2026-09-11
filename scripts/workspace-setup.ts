import { configureOwnerPassword } from "../src/lib/auth/owner-session";
async function passwordPrompt() {
  if (!process.stdin.isTTY) {
    let input = ""; for await (const chunk of process.stdin) { input += chunk.toString(); if (input.length > 500) throw new Error("Password input too long."); }
    return input.trim();
  }
  process.stderr.write("Create an owner password (14+ characters; input hidden): ");
  process.stdin.setRawMode(true); process.stdin.resume();
  try { return await new Promise<string>((resolve, reject) => {
    let value = "";
    const onData = (chunk: Buffer) => {
      for (const c of chunk.toString()) {
        if (c === "\u0003") { process.stdin.off("data", onData); reject(new Error("Setup cancelled.")); return; }
        if (c === "\r" || c === "\n") { process.stdin.off("data", onData); resolve(value); return; }
        if (c === "\u007f") value = value.slice(0, -1); else value += c;
      }
    }; process.stdin.on("data", onData);
  }); } finally { process.stdin.setRawMode(false); process.stdin.pause(); process.stderr.write("\n"); }
}
async function main() {
  // Setup never writes passwords to arguments, history or logs.
  configureOwnerPassword(await passwordPrompt(), process.argv.includes("--reset-password"));
  console.log("Owner sign-in configured. Start the app and sign in at /api/auth/login. Existing sessions were revoked.");
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Setup failed"); process.exitCode = 1; });
