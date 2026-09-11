/** Single-merchant server vault. Atomic encrypted files on the configured data volume. */
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
export function dataDirectory() { return process.env.DEALDESK_DATA_DIR || path.join(process.cwd(), ".data"); }
function key(): Buffer {
  const dir = dataDirectory(); mkdirSync(dir,{recursive:true,mode:0o700});
  const file=path.join(dir,"vault.key");
  try { return Buffer.from(readFileSync(file,"utf8"),"base64"); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const value=randomBytes(32);
    try { writeFileSync(file,value.toString("base64"),{mode:0o600,flag:"wx"}); return value; }
    catch (err) { if ((err as NodeJS.ErrnoException).code === "EEXIST") return Buffer.from(readFileSync(file,"utf8"),"base64"); throw err; }
  }
}
export function readVault(): Record<string,string> {
  try {
    const envelope=JSON.parse(readFileSync(path.join(dataDirectory(),"connections.enc"),"utf8"));
    const decipher=createDecipheriv("aes-256-gcm",key(),Buffer.from(envelope.iv,"base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag,"base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data,"base64")),decipher.final()]).toString("utf8"));
  } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return {}; throw new Error("The connection vault could not be opened. Restore its encryption key and data together."); }
}
export function saveSecrets(patch: Record<string,string|null>) {
  const data=readVault(); for(const [k,v] of Object.entries(patch)) { if(v===null) delete data[k]; else data[k]=v; }
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(),iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(data),"utf8"),cipher.final()]);
  const temporary=path.join(dataDirectory(),`connections-${randomUUID()}.tmp`);
  writeFileSync(temporary,JSON.stringify({iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),data:encrypted.toString("base64")}),{mode:0o600});
  renameSync(temporary,path.join(dataDirectory(),"connections.enc"));
}
export function setting(name:string):string { return readVault()[name] ?? process.env[name]?.trim() ?? ""; }
export function appBaseUrl():string { return setting("APP_BASE_URL") || "http://localhost:3000"; }
/** Encrypt short-lived integration credentials with the private workspace key. */
export function sealSecret(value: string): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return JSON.stringify({ iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") });
}
export function openSecret(value: string): string {
  const envelope = JSON.parse(value), decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]).toString("utf8");
}
