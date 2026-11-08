/** Minimal stored ZIP writer: no shell, dependency, compression or temporary tax files. */
export function zipFiles(files:{name:string;bytes:Buffer}[]):Buffer {
  if(files.length>500)throw new Error("Package contains too many files.");
  if(files.reduce((n,f)=>n+f.bytes.length,0)>100*1024*1024)throw new Error("Export packages are limited to 100 MB. Split the reviewed engagement package.");
  const names=new Set<string>(),local:Buffer[]=[],directory:Buffer[]=[];let offset=0;
  const table=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  for(const file of files){
    if(!/^[A-Za-z0-9_./-]+$/.test(file.name)||file.name.startsWith("/")||file.name.split("/").includes("..")||names.has(file.name))throw new Error("Invalid or duplicate package filename.");
    names.add(file.name);const name=Buffer.from(file.name),header=Buffer.alloc(30),central=Buffer.alloc(46);let crc=0xffffffff;
    for(const b of file.bytes)crc=table[(crc^b)&255]^(crc>>>8);crc=(crc^0xffffffff)>>>0;
    header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(file.bytes.length,18);header.writeUInt32LE(file.bytes.length,22);header.writeUInt16LE(name.length,26);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(33,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(file.bytes.length,20);central.writeUInt32LE(file.bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
    local.push(header,name,file.bytes);directory.push(central,name);offset+=header.length+name.length+file.bytes.length;
  }
  const index=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,index,end]);
}
