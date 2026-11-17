const kinds=['income','expense','trip'];
const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);

// Multiple device snapshots can carry the same copied record. Count identical
// copies once; differing copies require review instead of an invented winner.
export function dashboardActivity(items) {
  const rows=new Map(),conflicts=new Set();
  function put(item,record,key) {
    if(!record||!kinds.includes(record.kind)||!record.body||typeof record.body!=='object')return;
    const row={objectId:item.objectId,record},previous=rows.get(key);
    if(previous&&canonical(previous.record)!==canonical(record))conflicts.add(key);
    else if(!previous)rows.set(key,row);
  }
  for(const {item,value} of items) {
    if(value?.type==='driver-record')put(item,value.record,value.record?.id??`object:${item.objectId}`);
    if(value?.type==='driver-journal'&&item.journalBinding&&value.binding&&Object.keys(item.journalBinding).every(key=>value.binding[key]===item.journalBinding[key])) {
      for(const entry of value.journal.entries)if(typeof entry?.record?.id==='string')put(item,entry.record,entry.record.id);
    }
  }
  return {rows:[...rows].filter(([key,{record}])=>!conflicts.has(key)&&record.deleted!==true).map(([,row])=>row),conflicts:conflicts.size};
}
