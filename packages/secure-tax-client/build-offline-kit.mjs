import {readFile,readdir,mkdir,writeFile,lstat,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const source=fileURLToPath(new URL('.',import.meta.url)),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=['legacy-book-conversion.mjs','legacy-books.mjs','legacy-import.mjs','migrate-legacy.mjs','migrate-legacy-cli.mjs','key-recovery.mjs','firm-client-key-recovery.mjs','prepare-client-key-recovery-job.mjs','prepare-authenticator-recovery-job.mjs','prepare-enrollment-renewal-job.mjs','prepare-password-recovery-job.mjs','enrollment-renewal.mjs','firm-enrollment-renewal.mjs','authenticator-recovery.mjs','firm-authenticator-recovery.mjs','password-recovery.mjs','firm-password-recovery.mjs','envelope.mjs','firm-recovery.mjs','firm-staff.mjs','staff-contract.mjs','staff-grants.mjs','offline-cli.mjs','staff-offline-cli.mjs','return-edit-contract.mjs','return-proposals.mjs','firm-return-edits.mjs','return-edit-review.mjs','return-edit-offline-cli.mjs','prepare-return-edit-job.mjs','return-create-contract.mjs','return-creations.mjs','firm-return-creations.mjs','return-create-review.mjs','return-create-offline-cli.mjs','prepare-return-create-job.mjs','case-contract.mjs','case-model.mjs','case-json.mjs','case-authorization.mjs','case-books.mjs','office-validation.mjs','office-billing.mjs','office-model.mjs','case-certificate.mjs','case-proposals.mjs','firm-cases.mjs','case-review.mjs','case-offline-cli.mjs','prepare-case-job.mjs','inspect-case-review.mjs'];
async function walk(directory,prefix=''){
  const result=[];
  for(const name of (await readdir(path.join(directory,prefix))).sort()){const relative=path.posix.join(prefix,name),info=await lstat(path.join(directory,relative));if(info.isSymbolicLink())throw new Error('Offline kit dependencies must be regular reviewed files.');if(info.isDirectory())result.push(...await walk(directory,relative));else if(info.isFile())result.push(relative);else throw new Error('Unsupported offline kit input.');}return result;
}
const instructions=`# Shuug separate-computer key kit

Run this kit on the firm's separately trusted key computer. Node.js 22.13 or
newer is required. It includes lock-matched local crypto dependencies; no npm
download, application server, tax engine or cloud account is needed at runtime.

The kit contains public source code and a SHA-256 inventory. It has no firm keys,
passphrases, credentials, client data or automatic initialization. Verify its
inventory through the firm's trusted software-release channel before use.

Use node offline-cli.mjs for init/sign/renew/recover/approve-password-recovery/approve-authenticator-recovery/recover-client-key and node staff-offline-cli.mjs for
grant/share/recover-device/revoke. Invoking either without arguments prints its
required explicit options and exits without key operations. Pass the private
bundle, public pins and selected inputs explicitly. Passphrases use a selected
file descriptor, never a command argument. Every operation requires the existing
--confirm-off-host acknowledgment; this flag does not verify physical separation.

Lost client-key recovery requires the full encrypted snapshot and explicit identity/new-key review. The firm preserves exact content and revisions; the owner stages replacements and the customer proves the new key before activation. Staff sharing and changed dependencies require fresh review.

Copied-backup preparation is available through migrate-legacy-cli.mjs with its explicit offhost/copied-backup confirmations, reviewed manifest hash and destination binding. It signs an encrypted import preparation, never uploads or purges. The customer reviews and imports its supported records in the independent client.

Keep the encrypted firm bundle, its separate unlock passphrase and recoverable
backups away from the app/data host. Distribute only the public pins, signed
manifests/grants/capsules and revocations through verified channels. Never replace
an existing firm's pins with newly generated keys. Existing outputs are not
overwritten; all readable recovered objects remain private to this key computer.

Staff corrections use a private before/after review kit. Review its actual fields
on the trusted computer, record that exact file's SHA-256, then invoke
return-edit-offline-cli.mjs with its explicit review/offhost flags, trusted pins,
encrypted bundle and separate passphrase descriptor. Only the resulting signed
encrypted approval is published through the owner's independent client.
prepare-return-edit-job.mjs instead prepares an opaque cloud job from the same
reviewed kit for the existing immutable-version/MFA operator workflow. It does
not copy readable before/after values into that job. Neither command makes a
read grant a direct client-write credential or certifies the tax calculation.

Preparers can also propose an initial return without a client-created source.
Review its private creation kit and exact file hash, then use
return-create-offline-cli.mjs or prepare-return-create-job.mjs with the same
explicit inputs and review confirmations. The resulting firm approval contains
one new revision-1 envelope and signed read capsule. Owner publication rejects
existing or deleted object IDs; it never overwrites an earlier return. Review
identity, content and assignment on the trusted device before approving.

Private office cases use case-offline-cli.mjs and prepare-case-job.mjs with the
same explicit offhost/review/file-hash inputs. Review the before/after case,
command and selected evidence on the trusted computer. The worker reopens the
actual certified source and selected encrypted evidence, reapplies the command
and reconstructs the commitment. Actions, request titles, notes, selected source
links and readable evidence remain encrypted in the job. A case review is not
client filing authorization or an IRS/state acceptance.

Before attesting review, use:
node inspect-case-review.mjs --public-pins PUBLIC_PINS.json --kit PRIVATE_KIT.json --out NEW_PRIVATE_DIRECTORY
It creates a private700 directory with exact private-kit.json bytes, review.json,
kit-sha256.txt and, when selected, an ordinary PDF/JPEG/PNG/CSV evidence file or
selected-draft.json. It uses no keys, network, approval or automatic file opening.
These are candidate private copies, not proof the readable review matches the
encrypted proposal. Review the fields and actual file; final firm approval
reconstructs their correspondence. Then use that copied private-kit.json and
its exact kit-sha256.txt hash for approval. Existing directories are refused.

Shuug also supplies a separately controlled cloud key-service deployment package.
These are two supported custody options. They must preserve the chosen firm's
trust pins. Switching an existing firm or sharing keys between options needs an
explicit migration/recovery design; separate initialization creates separate keys.
Neither kit initializes itself or enables filing. With independently installed
public pins, new private accounts use the owner invitation and signed enrollment
workflow in the independent client. Legacy migration remains separate.

Forgotten-password recovery uses offline-cli.mjs approve-password-recovery with
--request PRIVATE-INVITATION.json --out NEW-APPROVAL.json plus the bundle, public
pins, passphrase descriptor, --confirm-off-host and
--confirm-identity-and-fingerprint. Review the actual account and existing client
key before attesting. The client still needs that key and its authenticator.
prepare-password-recovery-job.mjs prepares the equivalent reviewed cloud job;
it excludes the private invitation token and does not create cloud resources.

Expired enrollment can be renewed without changing either encryption key. The
client or verified owner downloads its public renewal request. Review its account
and client-key fingerprint, then use offline-cli.mjs renew with --request FILE,
--out NEW-FILE and the same bundle, public pins, passphrase descriptor and two
confirmation flags. prepare-enrollment-renewal-job.mjs prepares the equivalent
public cloud job. The client or owner publishes the signed renewal, then refreshes
staff sharing capsules. Encrypted reads remain blocked until renewal is published.
Owner publication also permits forgotten-password recovery after expiry.

Lost authenticators use offline-cli.mjs approve-authenticator-recovery with the
private invitation as --request, an exclusive --out, the existing bundle/pins,
passphrase descriptor and both confirmation flags. Review replacement explicitly;
a password-recovery approval cannot replace MFA. The client proves the current
password, original encryption key and a new authenticator code before the factor
changes. Old sessions and recovery codes are revoked; encrypted data is unchanged.
prepare-authenticator-recovery-job.mjs prepares the equivalent public cloud job
without its private invitation token. It does not provision or invoke AWS.
`;
export async function buildOfflineKit(output){
  if(typeof output!=='string'||!path.isAbsolute(output))throw new Error('Select a new absolute offline kit directory.');
  const lock=JSON.parse(await readFile(path.join(source,'package-lock.json'),'utf8')),dependencies={'@hpke/core':'1.10.0','@hpke/common':'1.11.0'},contents=[];
  for(const file of files)contents.push({path:file,bytes:await readFile(path.join(source,file))});
  for(const [name,version]of Object.entries(dependencies)){const directory=path.join(source,'node_modules',name),installed=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));if(installed.version!==version||lock.packages[`node_modules/${name}`]?.version!==version)throw new Error('The crypto dependencies differ from the reviewed lock.');for(const file of await walk(directory))contents.push({path:path.posix.join('node_modules',name,file),bytes:await readFile(path.join(directory,file))});}
  contents.push({path:'package.json',bytes:Buffer.from(JSON.stringify({name:'shuug-separate-computer-key-kit',version:'1.0.0',private:true,type:'module',engines:{node:'>=22.13.0'},dependencies},null,2)+'\n')},{path:'README.md',bytes:Buffer.from(instructions)});contents.sort((a,b)=>a.path.localeCompare(b.path,'en'));
  const manifest={version:1,purpose:'separate-computer-key-custody',dependencies,containsPrivateKeys:false,containsClientData:false,initialized:false,files:contents.map(file=>({path:file.path,sha256:sha(file.bytes),bytes:file.bytes.length}))};
  let owned=false;
  try{await mkdir(output,{mode:0o700});owned=true;for(const file of contents){const destination=path.join(output,file.path);await mkdir(path.dirname(destination),{recursive:true,mode:0o700});await writeFile(destination,file.bytes,{mode:0o600,flag:'wx'});}await writeFile(path.join(output,'kit-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});}
  catch(error){if(owned)await rm(output,{recursive:true,force:true});throw error;}return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--output')throw new Error('Usage: node build-offline-kit.mjs --output /new/absolute/directory');const result=await buildOfflineKit(path.resolve(args[1]));console.log(JSON.stringify({ok:true,files:result.files.length,initialized:false,containsPrivateKeys:false}));}
