import { backend } from './backend.mjs';
import { service } from './service.mjs';
import { verifyWebhook } from './payments.mjs';
import { reconcileBilling } from './billing.mjs';
export const config={api:{bodyParser:false}};
export function createWebhookHandler(env=process.env,adapter,options={}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
    const reply=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
    try {
      if(req.method!=='POST')return reply(405,{error:'POST required'});
      const parts=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>200000)return reply(413,{error:'Payload too large'});parts.push(Buffer.from(chunk));}
      const raw=Buffer.concat(parts);
      if(!verifyWebhook(raw,req.headers['stripe-signature'],env.GIGTAX_STRIPE_WEBHOOK_SECRET))return reply(400,{error:'Invalid webhook signature'});
      const event=JSON.parse(raw.toString()),object=event.data?.object;
      const db=adapter||backend(env);
      if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&object?.metadata?.gigtax_enrollment){
        await service(env,db).fulfill(object.metadata.gigtax_enrollment,object.id);
      }
      await reconcileBilling(env,db,event,options);
      return reply(200,{received:true});
    }catch{return reply(503,{error:'Payment confirmation pending; retry this event.'});}
  };
}
export default createWebhookHandler();
