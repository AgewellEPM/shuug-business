import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ReceiptFile } from "./model";
const run=promisify(execFile);
export const MAX_RECEIPT_BYTES=10*1024*1024;
export function receiptType(bytes:Buffer):Pick<ReceiptFile,"extension"|"mime"> {
  if(!bytes.length||bytes.length>MAX_RECEIPT_BYTES)throw new Error("Choose a receipt up to 10 MB.");
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {extension:"png",mime:"image/png"};
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {extension:"jpg",mime:"image/jpeg"};
  if(bytes.subarray(0,4).toString()==="RIFF"&&bytes.subarray(8,12).toString()==="WEBP")return {extension:"webp",mime:"image/webp"};
  if(bytes.subarray(0,5).toString()==="%PDF-")return {extension:"pdf",mime:"application/pdf"};
  if(bytes.subarray(4,8).toString()==="ftyp"&&/heic|heix|hevc|hevx|mif1/.test(bytes.subarray(8,32).toString()))return {extension:"heic",mime:"image/heic"};
  throw new Error("Choose a JPG, PNG, WebP, HEIC photo or PDF receipt.");
}
/** Local OCR using installed Tesseract/Poppler; never sends a receipt to a service. */
export async function extractReceipt(bytes:Buffer,type:ReturnType<typeof receiptType>):Promise<Pick<ReceiptFile,"text"|"extraction"|"message">> {
  const dir=await mkdtemp(path.join(tmpdir(),"shuug-receipt-"));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  const command=async(binary:string,args:string[])=>{
    const {stdout}=await run(binary,args,{timeout:15000,signal:controller.signal,maxBuffer:250000,env:{...process.env,OMP_THREAD_LIMIT:"1"}});return stdout;
  };
  try {
    const file=path.join(dir,`receipt.${type.extension}`);await writeFile(file,bytes,{mode:0o600});
    let images=[file],text="";
    if(type.extension==="pdf") {
      text=await command("pdftotext",["-f","1","-l","3","-layout",file,"-"]);
      if(text.trim().length<30){await command("pdftoppm",["-f","1","-l","3","-scale-to","2200","-png",file,path.join(dir,"page")]);images=(await readdir(dir)).filter(s=>/^page-\d+\.png$/.test(s)).sort().map(s=>path.join(dir,s));text="";}
    } else if(type.extension==="heic") {
      if(process.platform!=="darwin")return {text:"",extraction:"unavailable",message:"The original HEIC is saved. Enter its details, or upload a JPG or PNG for text extraction on this server."};
      const converted=path.join(dir,"converted.png");await command("/usr/bin/sips",["-s","format","png",file,"--out",converted]);images=[converted];
    }
    if(!text.trim())for(const file of images)text+=`${await command("tesseract",[file,"stdout","-l","eng","--psm","6"])}\n`;
    text=text.replace(/\u0000/g,"").trim().slice(0,60000);
    return {text,extraction:text?"read":"failed",message:text?`Suggested details need your review.${type.extension==="pdf"?" Text extraction covers the first three PDF pages.":""}`:"The original is saved, but no readable text was found. Enter the details below."};
  } catch(e) {
    const unavailable=(e as NodeJS.ErrnoException).code==="ENOENT";
    return {text:"",extraction:unavailable?"unavailable":"failed",message:unavailable?"Your receipt is saved. Automatic text reading is unavailable on this server; enter its details below.":"Your receipt is saved. Text reading could not finish; enter its details below."};
  } finally {clearTimeout(timer);await rm(dir,{recursive:true,force:true});}
}
