import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.99.2";
import webpush from "npm:web-push@3.6.7";

const CRON_SECRET_SHA256=Deno.env.get("NAT_PUSH_CRON_SECRET_SHA256")??"";

function getServiceKeys(){
  const keys:string[]=[];
  const raw=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(raw){try{const parsed=JSON.parse(raw) as Record<string,unknown>;for(const value of Object.values(parsed))if(typeof value==="string"&&value)keys.push(value);}catch{throw new Error("Supabase secret keys are malformed.");}}
  const single=Deno.env.get("SUPABASE_SECRET_KEY");if(single)keys.push(single);
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(legacy)keys.push(legacy);
  return [...new Set(keys)];
}
function getServiceKey(){const key=getServiceKeys()[0];if(!key)throw new Error("Supabase secret key is unavailable.");return key;}
async function sha256Hex(value:string){const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));return[...bytes].map((byte)=>byte.toString(16).padStart(2,"0")).join("");}
async function secureEqual(left:string,right:string){
  const encoder=new TextEncoder();const[leftHash,rightHash]=await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(left)),crypto.subtle.digest("SHA-256",encoder.encode(right))]);
  const a=new Uint8Array(leftHash);const b=new Uint8Array(rightHash);let difference=a.length^b.length;for(let index=0;index<Math.min(a.length,b.length);index+=1)difference|=a[index]^b[index];return difference===0;
}
function createAdmin(){const url=Deno.env.get("SUPABASE_URL");if(!url)throw new Error("Supabase URL is unavailable.");return createClient(url,getServiceKey(),{auth:{persistSession:false,autoRefreshToken:false}});}
async function authorizeServiceRequest(req:Request){
  const suppliedKey=req.headers.get("apikey")??"";
  if(suppliedKey){for(const key of getServiceKeys())if(await secureEqual(suppliedKey,key))return true;}
  const suppliedCronSecret=req.headers.get("x-nat-cron-secret")??"";
  if(!suppliedCronSecret||!CRON_SECRET_SHA256)return false;
  return secureEqual(await sha256Hex(suppliedCronSecret),CRON_SECRET_SHA256);
}
function localDate(timeZone:string){const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const get=(type:string)=>parts.find((part)=>part.type===type)?.value??"";return`${get("year")}-${get("month")}-${get("day")}`;}
function plusOneDay(date:string){const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+1);return value.toISOString().slice(0,10);}
function reminderCopy(slot:number,count:number){const plural=count===1?"compromisso":"compromissos";if(slot===21)return{title:"Amanhã na NAT",body:`Você tem ${count} ${plural} na agenda de amanhã.`};const prefix=slot===9?"Bom dia":slot===12?"Agenda do meio-dia":"Agenda da tarde";return{title:`${prefix} · NAT`,body:`Você tem ${count} ${plural} na agenda.`};}
function belongsToSlot(slot:number,eventTime:string|null){if(slot===21)return true;const hour=eventTime?Number(eventTime.slice(0,2)):null;if(slot===9)return hour===null||hour<12;if(slot===12)return hour!==null&&hour>=12&&hour<16;return hour!==null&&hour>=16;}
function statusCodeOf(error:unknown){if(typeof error!=="object"||error===null||!("statusCode" in error))return null;const value=(error as{statusCode?:unknown}).statusCode;return typeof value==="number"?value:null;}
function retryAfterOf(error:unknown){if(typeof error!=="object"||error===null||!("headers" in error))return null;const headers=(error as{headers?:Record<string,string|string[]|undefined>}).headers;const value=headers?.["retry-after"];const raw=Array.isArray(value)?value[0]:value;const seconds=raw?Number(raw):NaN;return Number.isFinite(seconds)&&seconds>0?Math.min(Math.round(seconds),86400):null;}
function errorMessage(error:unknown){return error instanceof Error?error.message:String(error??"unknown");}
function isPermanent(status:number|null){return status===404||status===410;}
type Delivery={deliveryId:string;businessId:string;subscriptionId:string;userId:string;localDate:string;slot:number;eventCount:number};
type PushSubscriptionRow={id:string;user_id:string;business_id:string;endpoint:string;p256dh:string;auth:string};

async function deliver(admin:ReturnType<typeof createAdmin>,subscription:PushSubscriptionRow,delivery:Delivery){
  const copy=reminderCopy(delivery.slot,delivery.eventCount);
  try{
    await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},JSON.stringify({...copy,tag:`nat-${delivery.localDate}-${delivery.slot}`,url:"/dashboard?view=calendar",correlationId:delivery.deliveryId}),{TTL:60*60*6});
    const complete=await admin.rpc("complete_push_delivery",{p_id:delivery.deliveryId});if(complete.error)throw complete.error;return"sent" as const;
  }catch(error){
    const status=statusCodeOf(error);const permanent=isPermanent(status);if(permanent)await admin.from("push_subscriptions").update({enabled:false,updated_at:new Date().toISOString()}).eq("id",subscription.id);
    const failed=await admin.rpc("fail_push_delivery",{p_id:delivery.deliveryId,p_permanent:permanent,p_provider_status:status,p_error_code:status?`HTTP_${status}`:"NETWORK_ERROR",p_error_message:errorMessage(error),p_retry_after_seconds:retryAfterOf(error),p_max_attempts:5});if(failed.error)throw failed.error;
    const result=failed.data as{status?:string}|null;console.error("push delivery failed",delivery.deliveryId,status??"unknown",result?.status??"unknown");return(result?.status??"retry") as "retry"|"dead_letter"|"expired";
  }
}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return new Response(JSON.stringify({error:"METHOD_NOT_ALLOWED"}),{status:405,headers:{"Content-Type":"application/json"}});
  try{
    if(!(await authorizeServiceRequest(req)))return new Response(JSON.stringify({error:"UNAUTHORIZED"}),{status:401,headers:{"Content-Type":"application/json"}});
    const admin = createClient(Deno.env.get("SUPABASE_URL")??"",getServiceKey(),{auth:{persistSession:false,autoRefreshToken:false}});
    const configResult=await admin.rpc("get_push_backend_config");if(configResult.error)throw configResult.error;const config=configResult.data as{vapidPublic?:string;vapidPrivate?:string;subject?:string}|null;
    if(!config?.vapidPublic||!config.vapidPrivate)return new Response(JSON.stringify({error:"PUSH_NOT_CONFIGURED"}),{status:503,headers:{"Content-Type":"application/json"}});webpush.setVapidDetails(config.subject||"mailto:admin@nat-gestao.local",config.vapidPublic,config.vapidPrivate);
    const body=await req.json().catch(()=>({}));const correlationId=typeof body?.correlationId==="string"?body.correlationId:crypto.randomUUID();let sent=0,skipped=0,expired=0,retry=0,deadLetter=0;
    if(body?.retryOnly===true){
      const due=await admin.rpc("list_due_push_retries",{p_limit:100});if(due.error)throw due.error;
      for(const row of due.data??[]){const item=row as{delivery_id:string;business_id:string;subscription_id:string;user_id:string;local_date:string;slot:number;event_count:number};const claim=await admin.rpc("claim_push_delivery",{p_business_id:item.business_id,p_subscription_id:item.subscription_id,p_user_id:item.user_id,p_local_date:item.local_date,p_slot:item.slot,p_event_count:item.event_count,p_lease_seconds:120});if(claim.error)throw claim.error;const claimed=claim.data as{claimed?:boolean;id?:string}|null;if(!claimed?.claimed||!claimed.id){skipped+=1;continue;}const sub=await admin.from("push_subscriptions").select("id,user_id,business_id,endpoint,p256dh,auth").eq("id",item.subscription_id).eq("enabled",true).maybeSingle();if(sub.error)throw sub.error;if(!sub.data){await admin.rpc("fail_push_delivery",{p_id:claimed.id,p_permanent:true,p_error_code:"SUBSCRIPTION_MISSING",p_error_message:"Subscription missing or disabled"});expired+=1;continue;}const outcome=await deliver(admin,sub.data as PushSubscriptionRow,{deliveryId:claimed.id,businessId:item.business_id,subscriptionId:item.subscription_id,userId:item.user_id,localDate:item.local_date,slot:item.slot,eventCount:item.event_count});if(outcome==="sent")sent+=1;else if(outcome==="expired")expired+=1;else if(outcome==="dead_letter")deadLetter+=1;else retry+=1;}
      return new Response(JSON.stringify({ok:true,mode:"retry",correlationId,sent,skipped,expired,retry,deadLetter}),{headers:{"Content-Type":"application/json"}});
    }
    const slot=Number(body?.slot);if(![9,12,16,21].includes(slot))return new Response(JSON.stringify({error:"INVALID_SLOT"}),{status:400,headers:{"Content-Type":"application/json"}});const today=localDate("America/Sao_Paulo");const targetDate=slot===21?plusOneDay(today):today;
    const eventsResult=await admin.from("calendar_events").select("business_id,event_time,status,reminder_enabled").eq("event_date",targetDate).eq("status","planned").eq("reminder_enabled",true);if(eventsResult.error)throw eventsResult.error;const byBusiness=new Map<string,Array<{event_time:string|null}>>();for(const event of eventsResult.data??[]){if(!belongsToSlot(slot,event.event_time))continue;const list=byBusiness.get(event.business_id)??[];list.push({event_time:event.event_time});byBusiness.set(event.business_id,list);}
    for(const[businessId,events]of byBusiness){if(!events.length)continue;const subs=await admin.from("push_subscriptions").select("id,user_id,business_id,endpoint,p256dh,auth").eq("business_id",businessId).eq("enabled",true);if(subs.error)throw subs.error;for(const subscription of subs.data??[]){const claim=await admin.rpc("claim_push_delivery",{p_business_id:businessId,p_subscription_id:subscription.id,p_user_id:subscription.user_id,p_local_date:targetDate,p_slot:slot,p_event_count:events.length,p_lease_seconds:120});if(claim.error)throw claim.error;const claimed=claim.data as{claimed?:boolean;id?:string}|null;if(!claimed?.claimed||!claimed.id){skipped+=1;continue;}const outcome=await deliver(admin,subscription as PushSubscriptionRow,{deliveryId:claimed.id,businessId,subscriptionId:subscription.id,userId:subscription.user_id,localDate:targetDate,slot,eventCount:events.length});if(outcome==="sent")sent+=1;else if(outcome==="expired")expired+=1;else if(outcome==="dead_letter")deadLetter+=1;else retry+=1;}}
    return new Response(JSON.stringify({ok:true,mode:"slot",slot,targetDate,correlationId,sent,skipped,expired,retry,deadLetter}),{headers:{"Content-Type":"application/json"}});
  }catch(error){console.error("nat-push-dispatch",error instanceof Error?error.message:"unknown");return new Response(JSON.stringify({error:"INTERNAL_ERROR"}),{status:500,headers:{"Content-Type":"application/json"}});}
});
