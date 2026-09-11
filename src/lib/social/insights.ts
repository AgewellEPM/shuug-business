import type { SocialAccount,SocialSnapshot,SocialState } from "./model";
export function accountInsights(account:SocialAccount,state:SocialState){const snapshots=state.snapshots.filter(s=>s.accountId===account.id).sort((a,b)=>b.at.localeCompare(a.at)),latest=snapshots[0],previous=latest?snapshots.find(s=>s.at.slice(0,10)<latest.at.slice(0,10)&&s.followers!==null):undefined;
  const comparable=latest?.posts.filter(p=>p.metrics.likes!==null&&p.metrics.comments!==null)??[],average=comparable.length?comparable.reduce((n,p)=>n+p.metrics.likes!+p.metrics.comments!,0)/comparable.length:null;
  const growth=latest?.followers!==null&&latest?.followers!==undefined&&previous?.followers!==null&&previous?.followers!==undefined?latest.followers-previous.followers:null;
  return {latest,previous,growth,average,sample:comparable.length};
}
export function bestPosts(snapshot:SocialSnapshot|undefined){return (snapshot?.posts??[]).filter(p=>p.metrics.likes!==null&&p.metrics.comments!==null).sort((a,b)=>(b.metrics.likes!+b.metrics.comments!)-(a.metrics.likes!+a.metrics.comments!)).slice(0,5);}
