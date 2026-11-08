"use client";
import { statementCsvColumns, type StatementMapping } from "@/lib/accounting/bank-import";

export function StatementMappingFields({csv,mapping,onChange}:{csv:string;mapping:StatementMapping|undefined;onChange:(mapping:StatementMapping|undefined)=>void}) {
  let columns:string[]=[];
  try{columns=statementCsvColumns(csv,mapping?.headerRow??0);}catch{}
  if(!mapping)return <div className="space-y-2"><p className="text-sm">Standard columns: date,description,amount,reference. Dates use YYYY-MM-DD; deposits positive and withdrawals negative.</p><button type="button" className="dd-button" onClick={()=>onChange({mode:"signed",headerRow:0,dateColumn:0,descriptionColumn:1,amountColumn:2,referenceColumn:columns.length>3?3:null,dateFormat:"iso",positiveMeans:"deposit"})}>Map my bank’s columns</button></div>;
  const select=(label:string,value:number|null,change:(value:number|null)=>void,optional=false)=><label className="grid gap-1 text-sm">{label}<select className="rounded border p-2" aria-label={label} value={value??""} onChange={e=>change(e.target.value===""?null:Number(e.target.value))}>{optional&&<option value="">Create statement row references</option>}{columns.map((name,i)=><option key={i} value={i}>{i+1} · {name}</option>)}</select></label>;
  const common={headerRow:mapping.headerRow,dateColumn:mapping.dateColumn,descriptionColumn:mapping.descriptionColumn,referenceColumn:mapping.referenceColumn,dateFormat:mapping.dateFormat};
  return <fieldset className="space-y-3 rounded border p-3"><legend>Bank export layout</legend>
    <label className="grid gap-1 text-sm">Header row<input aria-label="Header row" className="rounded border p-2" type="number" min="1" max="21" value={mapping.headerRow+1} onChange={e=>onChange({...mapping,headerRow:Number(e.target.value)-1})}/></label>
    <p className="text-sm">Rows before this header are skipped. All following rows must be transactions; remove export footers or statement totals in the CSV preview.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {select("Transaction date",mapping.dateColumn,value=>onChange({...mapping,dateColumn:value!}))}
      {select("Description",mapping.descriptionColumn,value=>onChange({...mapping,descriptionColumn:value!}))}
      <label className="grid gap-1 text-sm">Date format<select aria-label="Date format" className="rounded border p-2" value={mapping.dateFormat} onChange={e=>onChange({...mapping,dateFormat:e.target.value as StatementMapping["dateFormat"]})}><option value="iso">YYYY-MM-DD</option><option value="mdy">MM/DD/YYYY</option><option value="dmy">DD/MM/YYYY</option></select></label>
      {select("Bank transaction reference",mapping.referenceColumn,value=>onChange({...mapping,referenceColumn:value}),true)}
      <label className="grid gap-1 text-sm">Amount layout<select aria-label="Amount layout" className="rounded border p-2" value={mapping.mode} onChange={e=>onChange(e.target.value==="split"?{...common,mode:"split",debitColumn:2,creditColumn:3,referenceColumn:null}:{...common,mode:"signed",amountColumn:2,positiveMeans:"deposit"})}><option value="signed">One signed amount column</option><option value="split">Separate debit and credit columns</option></select></label>
      {mapping.mode==="signed"?<>
        {select("Signed amount",mapping.amountColumn,value=>onChange({...mapping,amountColumn:value!}))}
        <label className="grid gap-1 text-sm">Positive amounts mean<select aria-label="Positive amounts mean" className="rounded border p-2" value={mapping.positiveMeans} onChange={e=>onChange({...mapping,positiveMeans:e.target.value as "deposit"|"withdrawal"})}><option value="deposit">Money in (deposits)</option><option value="withdrawal">Money out (withdrawals)</option></select></label>
      </>:<>{select("Debit (money out)",mapping.debitColumn,value=>onChange({...mapping,debitColumn:value!}))}{select("Credit (money in)",mapping.creditColumn,value=>onChange({...mapping,creditColumn:value!}))}<p className="text-sm">Use nonnegative amounts in separate debit and credit columns.</p></>}
    </div>
    {mapping.referenceColumn===null&&<p className="text-sm">Shuug will create references from this statement’s dates and row order. These are bookkeeping references, not bank-verified transaction IDs. Overlapping statements remain blocked.</p>}
    <p className="text-sm">USD amounts may use dollar signs, correctly grouped commas or parentheses for negatives. Preview the dates and signs before importing. This saves a statement for review; it does not post transactions.</p>
    <button type="button" className="dd-button" onClick={()=>onChange(undefined)}>Use standard Shuug CSV</button>
  </fieldset>;
}
