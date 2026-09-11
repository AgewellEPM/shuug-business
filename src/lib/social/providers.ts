import { randomUUID } from "node:crypto";
import { credentials,type SocialCredentials } from "./connections";
import { emptyMetrics,postSchema,type SocialAccount,type SocialMetrics,type SocialPost,type SocialSnapshot } from "./model";
import { num,object,rows,socialRequest,str,type Row } from "./http";
import { accessToken } from "./tokens";
const graph="https://graph.facebook.com/v24.0";
const validId=(value:string)=>{if(!/^\d{1,40}$/.test(value))throw new Error("Enter the numeric account or organization ID in connection settings.");return value;};
const publicUrl=(value:unknown)=>{try{const u=new URL(str(value));return u.protocol==="https:"&&!u.username&&!u.password?u.toString():"";}catch{return "";}};
function post(input:Partial<SocialPost>&Pick<SocialPost,"id"|"publishedAt">):SocialPost{return postSchema.parse({url:"",text:"",format:"Post",metrics:emptyMetrics(),...input,publishedAt:new Date(input.publishedAt).toISOString()});}
function mapMetrics(data:Row,mapping:Partial<Record<keyof SocialMetrics,string>>):SocialMetrics {return {...emptyMetrics(),...Object.fromEntries(Object.entries(mapping).map(([target,source])=>[target,num(data[source!])]))};}
function sub(data:Row,key:string){return data[key]&&typeof data[key]==="object"?object(data[key]):{};}
export async function pullSocialAccount(account:SocialAccount):Promise<SocialSnapshot> {
  if(account.disabled)throw new Error("This profile is hidden.");
  if(account.method!=="api")throw new Error("Import this platform's report to refresh its metrics.");
  const c=credentials(account.id),token=await accessToken(account,c),snapshot:SocialSnapshot={id:randomUUID(),accountId:account.id,at:new Date().toISOString(),source:"api",followers:null,posts:[],period:null,periodMetrics:null,partial:false,warnings:[],sourceUrl:account.profileUrl};
  if(account.role==="competitor"&&!["instagram","youtube","x","bluesky"].includes(account.platform))throw new Error("This adapter reads authorized accounts. Use a sourced report import for this competitor.");
  const request=(url:string,body?:unknown)=>socialRequest(url,token,body?{body}:{});
  if(account.platform==="instagram") {
    const id=validId(c.objectId||account.handle),fields="id,caption,media_type,permalink,timestamp,like_count,comments_count";
    let profile:Row,feed:Row;
    if(account.role==="competitor") {if(!/^[a-zA-Z0-9_.]{1,30}$/.test(account.handle))throw new Error("Enter the competitor's Instagram username.");const result=await request(`${graph}/${id}?fields=${encodeURIComponent(`business_discovery.username(${account.handle}){username,followers_count,media.limit(50){${fields}}}`)}`);profile=object(result.business_discovery);feed=sub(profile,"media");}
    else {profile=await request(`${graph}/${id}?fields=id,username,followers_count`);feed=await request(`${graph}/${id}/media?fields=${encodeURIComponent(fields)}&limit=50`);}
    if(account.role==="brand"&&str(profile.username).toLowerCase()!==account.handle.toLowerCase())throw new Error("The authorized Instagram account does not match this profile link.");
    snapshot.followers=num(profile.followers_count);snapshot.partial=!!sub(feed,"paging").next;
    snapshot.posts=rows(feed.data).map(p=>post({id:str(p.id),publishedAt:str(p.timestamp),url:publicUrl(p.permalink),text:str(p.caption),format:str(p.media_type,"Post"),metrics:mapMetrics(p,{likes:"like_count",comments:"comments_count"})}));
    snapshot.warnings.push("Recent-post lifetime likes and comments. Reach, saves and video views need platform insight exports; unavailable metrics stay blank.");
  }else if(account.platform==="facebook") {
    const id=validId(c.objectId||account.handle),profile=await request(`${graph}/${id}?fields=id,name,followers_count`),feed=await request(`${graph}/${id}/published_posts?fields=${encodeURIComponent("id,message,created_time,permalink_url,shares,comments.limit(0).summary(true),reactions.limit(0).summary(true)")}&limit=50`);
    snapshot.followers=num(profile.followers_count);snapshot.partial=!!sub(feed,"paging").next;
    snapshot.posts=rows(feed.data).map(p=>post({id:str(p.id),publishedAt:new Date(str(p.created_time)).toISOString(),url:publicUrl(p.permalink_url),text:str(p.message),metrics:{...emptyMetrics(),likes:num(sub(sub(p,"reactions"),"summary").total_count),comments:num(sub(sub(p,"comments"),"summary").total_count),shares:num(sub(p,"shares").count)}}));snapshot.warnings.push("The likes column represents Facebook reactions. Counts are lifetime totals on the returned posts, not period reach.");
  }else if(account.platform==="tiktok") {
    const info=await request("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username,follower_count"),profile=sub(sub(info,"data"),"user");if(str(profile.username).toLowerCase()!==account.handle.toLowerCase())throw new Error("The authorized TikTok username does not match this profile link. Reconnect with user.info.profile access.");snapshot.followers=num(profile.follower_count);
    const feed=await request("https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,create_time,share_url,view_count,like_count,comment_count,share_count",{max_count:20});const data=sub(feed,"data");snapshot.partial=data.has_more===true;
    snapshot.posts=rows(data.videos).map(p=>post({id:str(p.id),publishedAt:new Date((num(p.create_time)??0)*1000).toISOString(),url:publicUrl(p.share_url),text:str(p.video_description)||str(p.title),format:"Short video",metrics:mapMetrics(p,{views:"view_count",likes:"like_count",comments:"comment_count",shares:"share_count"})}));snapshot.warnings.push("Lifetime counters for up to 20 recent public videos. Private video analytics and paid ad results are separate.");
  }else if(account.platform==="youtube") {await youtube(account,c,token,snapshot);}
  else if(account.platform==="x") {
    const handle=account.handle.replace(/^@/,"");if(!/^[a-zA-Z0-9_]{1,15}$/.test(handle))throw new Error("Enter an X username without a URL.");
    const profile=object((await request(`https://api.x.com/2/users/by/username/${handle}?user.fields=public_metrics`)).data);snapshot.followers=num(sub(profile,"public_metrics").followers_count);
    const feed=await request(`https://api.x.com/2/users/${validId(str(profile.id))}/tweets?max_results=100&tweet.fields=created_at,public_metrics`);snapshot.partial=!!sub(feed,"meta").next_token;
    snapshot.posts=rows(feed.data).map(p=>post({id:str(p.id),publishedAt:str(p.created_at),url:`https://x.com/${handle}/status/${str(p.id)}`,text:str(p.text),format:"Text",metrics:mapMetrics(sub(p,"public_metrics"),{views:"impression_count",likes:"like_count",comments:"reply_count",shares:"retweet_count"})}));snapshot.warnings.push("X public impression counts are shown as views. API access and reading charges depend on your X account.");
  }else if(account.platform==="bluesky") {
    const actor=encodeURIComponent(account.handle),profile=await request(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${actor}`);snapshot.followers=num(profile.followersCount);
    const feed=await request(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${actor}&limit=100&filter=posts_no_replies`);snapshot.partial=!!feed.cursor;
    snapshot.posts=rows(feed.feed).filter(p=>!p.reason).map(p=>{const value=object(p.post),record=object(value.record),id=str(value.uri);return post({id,publishedAt:str(record.createdAt),url:`https://bsky.app/profile/${encodeURIComponent(str(sub(value,"author").handle,account.handle))}/post/${encodeURIComponent(id.split("/").at(-1)!)}`,text:str(record.text),format:"Text",metrics:mapMetrics(value,{likes:"likeCount",comments:"replyCount",shares:"repostCount"})});});snapshot.warnings.push("Public author posts only. Replies and reposts are excluded; views and reach are not provided.");
  }else if(account.platform==="threads") {
    const profile=await request("https://graph.threads.net/v1.0/me?fields=id,username"),id=validId(str(profile.id));
    if(str(profile.username).toLowerCase()!==account.handle.toLowerCase())throw new Error("The authorized Threads account does not match this profile link.");
    const feed=await request(`https://graph.threads.net/v1.0/${id}/threads?fields=id,text,timestamp,permalink,media_type&limit=50`);snapshot.partial=!!sub(feed,"paging").next;
    snapshot.posts=rows(feed.data).map(p=>post({id:str(p.id),publishedAt:str(p.timestamp),url:publicUrl(p.permalink),text:str(p.text),format:str(p.media_type)}));
    try{const insights=await request(`https://graph.threads.net/v1.0/${id}/threads_insights?metric=followers_count`);const metric=rows(insights.data).find(m=>m.name==="followers_count");snapshot.followers=metric?num(sub(metric,"total_value").value)??num(rows(metric.values)[0]?.value):null;}catch{snapshot.warnings.push("Threads follower insights were unavailable. Check threads_manage_insights access.");}
    snapshot.warnings.push("Recent posts are connected. Use an insights report import for post-level views and interactions.");
  }else if(account.platform==="linkedin") {
    const id=validId(c.objectId||account.handle),version=/^20\d{4}$/.test(c.version??"")?c.version!:"202607",headers={"Linkedin-Version":version,"X-Restli-Protocol-Version":"2.0.0"};
    const report=await socialRequest(`https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(`urn:li:organization:${id}`)}`,token,{headers});
    const result=rows(report.elements)[0];if(!result)throw new Error("LinkedIn returned no organization statistics.");snapshot.periodMetrics=mapMetrics(sub(result,"totalShareStatistics"),{impressions:"impressionCount",likes:"likeCount",comments:"commentCount",shares:"shareCount",clicks:"clickCount"});snapshot.warnings.push("Lifetime organization share statistics. Follower history and individual post analysis require a report import. Negative organic-like adjustments from LinkedIn are retained.");
  }else if(account.platform==="pinterest") {
    const profile=await request("https://api.pinterest.com/v5/user_account");if(str(profile.username).toLowerCase()!==account.handle.toLowerCase())throw new Error("The authorized Pinterest username does not match this profile link.");snapshot.followers=num(profile.follower_count);
    const end=new Date(Date.now()-86400000).toISOString().slice(0,10),start=new Date(Date.now()-29*86400000).toISOString().slice(0,10),report=await request(`https://api.pinterest.com/v5/user_account/analytics?start_date=${start}&end_date=${end}&metric_types=IMPRESSION,PIN_CLICK,OUTBOUND_CLICK,SAVE`);
    const all=sub(sub(report,"all"),"summary_metrics");if(!Object.keys(all).length)throw new Error("Pinterest did not return the requested analytics summary.");snapshot.period={start,end};snapshot.periodMetrics=mapMetrics(all,{impressions:"IMPRESSION",clicks:"OUTBOUND_CLICK",saves:"SAVE"});snapshot.warnings.push("Pinterest account analytics cover the displayed date range. Individual pin ideas require a post report import.");
  }else throw new Error("Use report import for this platform.");
  if(snapshot.partial)snapshot.warnings.push("This is a bounded recent-post sample. Older posts may be missing; import a complete report for broader analysis.");
  return snapshot;
}
async function youtube(account:SocialAccount,c:SocialCredentials,token:string,snapshot:SocialSnapshot) {
  const apiKey=c.apiKey?`&key=${encodeURIComponent(c.apiKey)}`:"",requested=c.objectId||account.handle,query=token&&account.role==="brand"?"mine=true":/^UC[\w-]{20,30}$/.test(requested)?`id=${encodeURIComponent(requested)}`:`forHandle=${encodeURIComponent(requested.replace(/^@/,""))}`;
  const request=(endpoint:string)=>socialRequest(`https://www.googleapis.com/youtube/v3/${endpoint}${apiKey}`,token);
  const channels=await request(`channels?part=snippet,statistics,contentDetails&${query}`),profile=rows(channels.items)[0];if(!profile)throw new Error("YouTube channel not found or not authorized.");
  if(token&&account.role==="brand"){const requestedProfile=await request(`channels?part=id&${/^UC[\w-]{20,30}$/.test(account.handle)?`id=${encodeURIComponent(account.handle)}`:`forHandle=${encodeURIComponent(account.handle)}`}`);if(str(rows(requestedProfile.items)[0]?.id)!==str(profile.id))throw new Error("The authorized YouTube channel does not match this profile link.");}
  snapshot.followers=sub(profile,"statistics").hiddenSubscriberCount===true?null:num(sub(profile,"statistics").subscriberCount);
  const playlist=str(sub(sub(profile,"contentDetails"),"relatedPlaylists").uploads);if(!playlist)throw new Error("YouTube did not provide the channel's uploads playlist.");
  const feed=await request(`playlistItems?part=contentDetails&playlistId=${encodeURIComponent(playlist)}&maxResults=50`);snapshot.partial=!!feed.nextPageToken;
  const ids=rows(feed.items).map(i=>str(sub(i,"contentDetails").videoId)).filter(Boolean);if(!ids.length)return;
  const videos=await request(`videos?part=snippet,statistics,contentDetails&id=${encodeURIComponent(ids.join(","))}`);
  snapshot.posts=rows(videos.items).map(p=>post({id:str(p.id),publishedAt:str(sub(p,"snippet").publishedAt),url:`https://www.youtube.com/watch?v=${encodeURIComponent(str(p.id))}`,text:`${str(sub(p,"snippet").title)}\n${str(sub(p,"snippet").description)}`.slice(0,8000),format:"Video",metrics:mapMetrics(sub(p,"statistics"),{views:"viewCount",likes:"likeCount",comments:"commentCount"})}));snapshot.warnings.push("Lifetime public video counters, not watch-time or unique viewers. YouTube may round public subscriber counts.");
}
