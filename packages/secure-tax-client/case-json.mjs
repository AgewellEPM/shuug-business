// Canonical bounded private review JSON shared by models and package bindings.
export const CASE_PRIVATE_JSON_MAX_BYTES=20*1024*1024;
const MAX_STRING=15*1024*1024,utf8=new TextEncoder();
const fail=()=>{throw new Error('The private tax case, transition or selected evidence is invalid.');};
/** Larger than the ordinary return commitment because one selected file may
 * contain up to 10 MiB of bytes. Body validation has its own much smaller cap. */
export function canonicalCaseJson(value){
  let total=0;const add=value=>{total+=utf8.encode(value).length;if(total>CASE_PRIVATE_JSON_MAX_BYTES)fail();return value;};
  function visit(value,depth){
    if(depth>24)fail();
    if(value===null||typeof value==='boolean')return add(JSON.stringify(value));
    if(typeof value==='number'){if(!Number.isSafeInteger(value))fail();return add(JSON.stringify(value));}
    if(typeof value==='string'){if(value.length>MAX_STRING)fail();return add(JSON.stringify(value));}
    if(Array.isArray(value)){if(value.length>5000)fail();return add('[')+value.map(item=>visit(item,depth+1)).join(add(','))+add(']');}
    if(value&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value))){
      const keys=Object.keys(value).sort();if(keys.length>100)fail();
      return add('{')+keys.map(key=>{if(key.length>256)fail();return add(JSON.stringify(key))+add(':')+visit(value[key],depth+1);}).join(add(','))+add('}');
    }fail();
  }
  const result=visit(value,0);if(utf8.encode(result).length>CASE_PRIVATE_JSON_MAX_BYTES)fail();return result;
}
