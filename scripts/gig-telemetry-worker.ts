import { runArgyleWorkerOnce } from "../src/lib/gig-connections/argyle-service";
let stopped=false;
process.on("SIGINT",()=>{stopped=true;});process.on("SIGTERM",()=>{stopped=true;});
const once=process.argv.includes("--once");
let configured:boolean|undefined,lastLog=0;
do {
  try {
    const result=await runArgyleWorkerOnce();
    if(once||result.processed||result.configured!==configured||Date.now()-lastLog>60_000) {
      console.log(JSON.stringify({at:new Date().toISOString(),...result}));lastLog=Date.now();
    }
    configured=result.configured;
  }
  catch {console.error("Connected-work worker needs attention. No provider credentials or records are logged.");}
  if(!once&&!stopped)await new Promise(resolve=>setTimeout(resolve,5000));
}while(!once&&!stopped);
