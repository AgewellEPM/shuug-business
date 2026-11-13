import {PDFDocument,PDFName,StandardFonts,rgb} from 'pdf-lib';
import {wholeDollars} from './money.mjs';

export const ctBox=(page,x,top,width,height=14)=>({page,x,top,width,height});
export const ctDigits=value=>String(value??'').replaceAll('-','');
export const ctDollars=value=>{if(!Number.isSafeInteger(value))throw new Error('A Connecticut printed amount must be known integer cents.');return String(wholeDollars(value)/100);};
const hex=bytes=>[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');

/** Shared mechanics for pinned, nonfillable Connecticut schedules. Does not
 * derive eligibility or place private values in the export audit. */
export async function ctOverlay(input,item,approved,{loadTemplate,width,height}={}){
 if(!approved||item.form!==approved.id||item.state!=='CT'||typeof loadTemplate!=='function')throw new Error('No reviewed annual Connecticut schedule is available.');
 const bytes=new Uint8Array(await loadTemplate(approved.id,input.year));
 if(bytes.length!==approved.bytes||hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))!==approved.sha256)throw new Error('The Connecticut schedule failed its pinned integrity check.');
 const pdf=await PDFDocument.load(bytes);
 if(pdf.getPageCount()!==approved.pages||pdf.getForm().getFields().length!==0||pdf.getPages().some(p=>p.getWidth()!==width||p.getHeight()!==height||p.getRotation().angle!==0))throw new Error('The Connecticut schedule structure changed.');
 for(const key of ['OpenAction','AA','Names'])pdf.catalog.delete(PDFName.of(key));
 for(const page of pdf.getPages())for(const key of ['Annots','AA'])page.node.delete(PDFName.of(key));
 const font=await pdf.embedFont(StandardFonts.Helvetica),fields=[];
 function draw(box,value,label,{right=false,center=false,size=10}={}){
  if(value===null||value===undefined||value==='')return;
  const text=String(value);if(/[\r\n]/.test(text))throw new Error('A Connecticut schedule box cannot contain line breaks.');
  while(size>6&&font.widthOfTextAtSize(text,size)>box.width)size-=.25;
  const textWidth=font.widthOfTextAtSize(text,size);
  if(textWidth>box.width||size>box.height-2)throw new Error('A Connecticut schedule field cannot fit the original value; no truncated value was exported.');
  const page=pdf.getPage(box.page),x=box.x+(right?box.width-textWidth:center?(box.width-textWidth)/2:0),y=page.getHeight()-box.top-(box.height+size*.7)/2;
  page.drawText(text,{x,y,size,font,color:rgb(0,0,0)});fields.push({line:label,page:box.page,x,y,width:box.width});
 }
 function digits(page,positions,top,value,label,{size=10,height=14,width=9}={}){
  const text=ctDigits(value);if(!/^\d+$/.test(text)||text.length!==positions.length)throw new Error(`Connecticut ${label} must fit its exact digit boxes.`);
  positions.forEach((x,i)=>draw(ctBox(page,x,top,width,height),text[i],`${label}:${i+1}`,{size,center:true}));
 }
 function check(box,value,label){if(value===true)draw(box,'X',label,{size:10,center:true});else if(value!==false&&value!==null&&value!==undefined)throw new Error('A Connecticut checkbox requires reviewed boolean evidence.');}
 function continuation(title,rows,renderRow,{rowHeight=90}={}){
  let pageIndex,top=800;
  for(const [index,row]of rows.entries()){
   if(top+rowHeight>740){pageIndex=pdf.getPageCount();pdf.addPage([612,792]);top=110;
    draw(ctBox(pageIndex,36,26,540,22),`${input.year} ${title} - continuation`,'continuation:title',{size:13});
    draw(ctBox(pageIndex,36,52,540,18),input.party.name||[input.party.firstName,input.party.lastName].filter(Boolean).join(' '),'continuation:taxpayerName');
    draw(ctBox(pageIndex,36,75,540,18),`Taxpayer SSN: ${ctDigits(input.party.taxId)}`,'continuation:taxpayerId');
   }
   renderRow(row,index,{page:pageIndex,top,draw});top+=rowHeight;
  }
 }
 async function finish(extra={}){return {bytes:await pdf.save({useObjectStreams:false}),audit:{form:item.form,year:input.year,copyId:item.copyId,templateSha256:approved.sha256,sourceDraft:approved.sourceDraft,fields,continuationPages:pdf.getPageCount()-approved.pages,...extra}};}
 return {pdf,draw,digits,check,continuation,finish};
}
