import { PortalRefresh } from './client-portal.mjs';
import { renderStaffRecords } from './staff-view.mjs';

// This uses the existing complete signed read, including its final grant check.
// It adds neither staff writes nor a bypass around missing sharing capsules.
export function mountStaffUpdates(document,target,{
  getClient,isWorking=()=>false,setWorking=()=>{},refreshControls=()=>{},
  captureScope=()=>0,isCurrentScope=()=>true,onLocked=()=>{},onMessage=()=>{},
  download=()=>{},run=operation=>operation(),timers={},canRefresh=()=>true,onReturnEdit=null,
}={}){
  const status=document.createElement('p');status.id='staff-freshness';status.setAttribute('role','status');status.setAttribute('aria-live','polite');target.before(status);
  const ready=()=>{const client=getClient();return !!client?.identity&&client.unlocked&&!!client.selectedGrant&&!document.hidden;};
  let poller;
  const draw=state=>{status.textContent=!ready()?'Select a verified client scope to check current records.':!canRefresh()?'Update checks paused while a return correction is open. Save or clear that input before refreshing shared records.':state.checking?'Checking current shared client records…':`${state.lastUpdated?`Last checked ${new Date(state.lastUpdated).toLocaleString()}.`:'No successful update check in this client view.'} ${state.updatesPending?'Updates pending or not yet checked.':'Latest requested refresh completed.'} Automatic checks run every 60 seconds while visible and unlocked. Newly changed items require fresh sharing approval.`;};
  async function sync(){
    if(!ready()||isWorking()||!canRefresh())return false;
    const client=getClient(),generation=captureScope();setWorking(true);refreshControls();
    try{
      await client.sync();
      if(!isCurrentScope(generation)||client!==getClient()||!ready())return false;
      const grant=client.selectedGrant;
      const view=renderStaffRecords(document,client.records,{workspaceId:client.config.workspaceId,accountId:grant.accountId,clientId:grant.clientId},{download,run,onReturnEdit});
      target.replaceChildren(view);return true;
    }catch(error){
      if(isCurrentScope(generation)&&client===getClient()){client.lock();target.replaceChildren();onMessage(error instanceof Error?error.message:'Shared records could not be refreshed.',true);}
      throw error;
    }finally{
      setWorking(false);
      if(client===getClient()&&!client.unlocked)onLocked();
      refreshControls();
    }
  }
  poller=new PortalRefresh({interval:60000,...timers,eligible:()=>ready()&&!isWorking()&&canRefresh(),refresh:sync,onChange:draw});
  function activate(){if(ready())poller.start();else poller.stop({clear:true});draw(poller.state);}
  function clear(){poller.stop({clear:true});target.replaceChildren();draw(poller.state);}
  function lock(){const unlocked=!!getClient()?.unlocked;if(unlocked)getClient().lock();clear();if(unlocked)onLocked();refreshControls();}
  const visibility=()=>{if(document.hidden)lock();else activate();};
  document.addEventListener('visibilitychange',visibility);
  document.defaultView?.addEventListener('pagehide',lock);
  draw(poller.state);
  return {activate,clear,check:()=>{activate();return poller.tick();},get poller(){return poller;},destroy(){clear();document.removeEventListener('visibilitychange',visibility);document.defaultView?.removeEventListener('pagehide',lock);}};
}
