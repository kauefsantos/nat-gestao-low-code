import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.99.2";

const allowedOrigins=["https://nat-gestao.lovable.app","https://id-preview--e8925812-e861-40fe-89fd-38bc287dafd9.lovable.app"];
const AI_TIMEOUT_MS=30_000;
const MAX_PROVIDER_ATTEMPTS=3;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function corsHeaders(req:Request){const origin=req.headers.get("origin")??"";const allowed=allowedOrigins.includes(origin)||origin.startsWith("http://localhost:");return{"Access-Control-Allow-Origin":allowed?origin:allowedOrigins[0],"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-request-id","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};}
function getServiceKey(){const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(legacy)return legacy;const raw=Deno.env.get("SUPABASE_SECRET_KEYS");if(!raw)throw new Error("Supabase secret key is unavailable.");const parsed=JSON.parse(raw) as Record<string,string>;const key=parsed.default??Object.values(parsed)[0];if(!key)throw new Error("Supabase secret key is unavailable.");return key;}
function jwtPayload(token:string){try{const part=token.split(".")[1];if(!part)return null;const normalized=part.replace(/-/g,"+").replace(/_/g,"/");const padded=normalized+"=".repeat((4-normalized.length%4)%4);return JSON.parse(atob(padded)) as{aal?:string;session_id?:string};}catch{return null;}}
function extractOutputText(payload:any){if(typeof payload?.output_text==="string")return payload.output_text;const chunks:string[]=[];for(const item of payload?.output??[])for(const content of item?.content??[])if(content?.type==="output_text"&&typeof content.text==="string")chunks.push(content.text);return chunks.join("\n");}
function parseJsonText(value:string){return JSON.parse(value.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,""));}
function clampText(value:unknown,max:number){return typeof value==="string"?value.trim().slice(0,max):"";}
function elapsed(startedAt:number){return Math.max(0,Date.now()-startedAt);}
function usageOf(payload:any){const usage=payload?.usage??{};return{input:Number.isFinite(Number(usage.input_tokens))?Number(usage.input_tokens):null,output:Number.isFinite(Number(usage.output_tokens))?Number(usage.output_tokens):null,total:Number.isFinite(Number(usage.total_tokens))?Number(usage.total_tokens):null};}
function containsPersonalData(prompt:string){const patterns=[/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/,/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/,/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{14}\b/,/\b(?:cpf|cnpj|telefone|whatsapp|e-?mail|endereço|endereco)\s*(?:do|da|de)?\s*(?:cliente|comprador|titular)?\s*[:=]/i];return patterns.some((pattern)=>pattern.test(prompt));}
function sleep(ms:number){return new Promise((resolve)=>setTimeout(resolve,ms));}
function isTransientStatus(status:number){return[408,425,429,500,502,503,504].includes(status);}
function retryAfterMs(response:Response){const raw=response.headers.get("retry-after");if(!raw)return null;const seconds=Number(raw);if(Number.isFinite(seconds)&&seconds>=0)return Math.min(seconds*1000,5000);const date=Date.parse(raw);if(Number.isFinite(date))return Math.min(Math.max(0,date-Date.now()),5000);return null;}
async function finishLog(admin:SupabaseClient|null,id:string|null,startedAt:number,status:string,options:{providerStatus?:number|null;usage?:ReturnType<typeof usageOf>;errorCode?:string|null}={}){if(!admin||!id)return;const result=await admin.rpc("finish_content_ai_generation",{p_id:id,p_status:status,p_latency_ms:elapsed(startedAt),p_provider_status:options.providerStatus??null,p_input_tokens:options.usage?.input??null,p_output_tokens:options.usage?.output??null,p_total_tokens:options.usage?.total??null,p_error_code:options.errorCode??null});if(result.error)console.error("AI usage log finalization failed",result.error.message);}

Deno.serve(async(req)=>{
  const cors=corsHeaders(req);if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return new Response(JSON.stringify({error:"METHOD_NOT_ALLOWED"}),{status:405,headers:{...cors,"Content-Type":"application/json"}});
  const startedAt=Date.now();let admin:SupabaseClient|null=null;let logId:string|null=null;let businessId="";let circuitTransientFailure=false;
  try{
    const authHeader=req.headers.get("authorization")??"";const token=authHeader.replace(/^Bearer\s+/i,"");if(!token)return new Response(JSON.stringify({error:"UNAUTHORIZED"}),{status:401,headers:{...cors,"Content-Type":"application/json"}});
    const claims=jwtPayload(token);if(claims?.aal!=="aal2")return new Response(JSON.stringify({error:"MFA_REQUIRED"}),{status:403,headers:{...cors,"Content-Type":"application/json"}});if(!claims.session_id)return new Response(JSON.stringify({error:"UNAUTHORIZED"}),{status:401,headers:{...cors,"Content-Type":"application/json"}});
    const url=Deno.env.get("SUPABASE_URL");if(!url)throw new Error("Supabase URL is unavailable.");admin=createClient(url,getServiceKey(),{auth:{persistSession:false,autoRefreshToken:false}});
    const userResult=await admin.auth.getUser(token);if(userResult.error||!userResult.data.user)return new Response(JSON.stringify({error:"UNAUTHORIZED"}),{status:401,headers:{...cors,"Content-Type":"application/json"}});
    const sessionResult=await admin.rpc("is_active_auth_session_for_user",{p_user_id:userResult.data.user.id,p_session_id:claims.session_id});if(sessionResult.error||sessionResult.data!==true)return new Response(JSON.stringify({error:"UNAUTHORIZED"}),{status:401,headers:{...cors,"Content-Type":"application/json"}});
    const body=await req.json();businessId=typeof body?.businessId==="string"?body.businessId:"";const prompt=typeof body?.prompt==="string"?body.prompt.trim():"";const format=["feed","story","square"].includes(body?.format)?body.format:"feed";const suppliedRequestId=typeof body?.requestId==="string"?body.requestId:req.headers.get("x-request-id")??"";const correlationId=UUID_RE.test(suppliedRequestId)?suppliedRequestId:crypto.randomUUID();
    if(!businessId||prompt.length<3||prompt.length>1500)return new Response(JSON.stringify({error:"INVALID_INPUT"}),{status:400,headers:{...cors,"Content-Type":"application/json"}});
    const membership=await admin.from("business_members").select("role").eq("business_id",businessId).eq("user_id",userResult.data.user.id).maybeSingle();if(membership.error||!membership.data)return new Response(JSON.stringify({error:"FORBIDDEN"}),{status:403,headers:{...cors,"Content-Type":"application/json"}});
    if(containsPersonalData(prompt))return new Response(JSON.stringify({error:"PII_NOT_ALLOWED",message:"Remova dados pessoais de clientes antes de usar a IA."}),{status:400,headers:{...cors,"Content-Type":"application/json"}});

    const previous=await admin.from("ai_generation_log").select("id,status,cost_quota_consumed").eq("business_id",businessId).eq("user_id",userResult.data.user.id).eq("correlation_id",correlationId).maybeSingle();
    if(previous.error)throw previous.error;
    if(previous.data?.cost_quota_consumed)return new Response(JSON.stringify({error:"REQUEST_ALREADY_PROCESSED",requestId:correlationId}),{status:409,headers:{...cors,"Content-Type":"application/json"}});

    const circuit=await admin.rpc("content_ai_circuit_allows" as never,{p_business_id:businessId} as never);if(circuit.error)throw circuit.error;if(circuit.data!==true)return new Response(JSON.stringify({error:"AI_TEMPORARILY_UNAVAILABLE"}),{status:503,headers:{...cors,"Content-Type":"application/json","Retry-After":"300"}});
    const quota=await admin.rpc("claim_content_ai_quota",{p_business_id:businessId,p_user_id:userResult.data.user.id,p_format:format,p_prompt_chars:prompt.length});if(quota.error)throw quota.error;logId=quota.data as string|null;if(!logId)return new Response(JSON.stringify({error:"RATE_LIMITED"}),{status:429,headers:{...cors,"Content-Type":"application/json","Retry-After":"600"}});
    const correlationUpdate=await admin.from("ai_generation_log").update({correlation_id:correlationId}).eq("id",logId);if(correlationUpdate.error)throw correlationUpdate.error;
    const budget=await admin.rpc("claim_content_ai_provider_budget" as never,{p_id:logId,p_correlation_id:correlationId} as never);if(budget.error)throw budget.error;const budgetData=budget.data as{allowed?:boolean;reason?:string}|null;if(!budgetData?.allowed){await finishLog(admin,logId,startedAt,"failed",{errorCode:budgetData?.reason??"AI_BUDGET_EXCEEDED"});return new Response(JSON.stringify({error:"AI_BUDGET_EXCEEDED",reason:budgetData?.reason}),{status:429,headers:{...cors,"Content-Type":"application/json","Retry-After":"3600"}});}

    const keyResult=await admin.rpc("get_content_ai_key",{p_business_id:businessId});if(keyResult.error)throw keyResult.error;const apiKey=keyResult.data as string|null;if(!apiKey){await finishLog(admin,logId,startedAt,"failed",{errorCode:"AI_NOT_CONFIGURED"});return new Response(JSON.stringify({error:"AI_NOT_CONFIGURED"}),{status:503,headers:{...cors,"Content-Type":"application/json"}});}
    const instructions=["Você é a redatora e diretora criativa da NAT, marca brasileira de brownies e brigadeiros gourmet.","Tom: afetivo, elegante, artesanal e próximo.","Crie uma peça social objetiva para o formato solicitado.","Retorne SOMENTE JSON válido, sem markdown, com as chaves: headline, subheadline, caption, cta, visual_direction.","Não invente preço, prazo, estoque, ingredientes ou disponibilidade.","Nunca solicite, reproduza ou infira dados pessoais de clientes."].join("\n");

    let openai:Response|null=null;let responseJson:any=null;let lastProviderStatus:number|null=null;
    for(let attempt=1;attempt<=MAX_PROVIDER_ATTEMPTS;attempt+=1){
      const increment=await admin.rpc("increment_content_ai_provider_attempt",{p_id:logId});if(increment.error)throw increment.error;
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),AI_TIMEOUT_MS);
      try{
        openai=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","X-Client-Request-Id":correlationId},body:JSON.stringify({model:"gpt-5.6-luna",instructions,input:`Formato: ${format}\nPedido da usuária: ${prompt}`,max_output_tokens:700}),signal:controller.signal});
        lastProviderStatus=openai.status;responseJson=await openai.json();
        if(openai.ok)break;
        if(!isTransientStatus(openai.status)||attempt===MAX_PROVIDER_ATTEMPTS){circuitTransientFailure=isTransientStatus(openai.status);break;}
        await sleep(retryAfterMs(openai)??Math.min(4000,400*2**(attempt-1)+Math.floor(Math.random()*200)));
      }catch(error){
        const isTimeout=error instanceof Error&&error.name==="AbortError";circuitTransientFailure=true;
        if(attempt===MAX_PROVIDER_ATTEMPTS){await admin.rpc("record_content_ai_provider_result" as never,{p_business_id:businessId,p_success:false,p_transient:true} as never);await finishLog(admin,logId,startedAt,isTimeout?"timeout":"provider_error",{errorCode:isTimeout?"AI_TIMEOUT":"AI_NETWORK_ERROR"});return new Response(JSON.stringify({error:isTimeout?"AI_TIMEOUT":"AI_PROVIDER_ERROR"}),{status:isTimeout?504:502,headers:{...cors,"Content-Type":"application/json"}});}
        await sleep(Math.min(4000,400*2**(attempt-1)+Math.floor(Math.random()*200)));
      }finally{clearTimeout(timeout);}
    }

    if(!openai||!openai.ok){await admin.rpc("record_content_ai_provider_result" as never,{p_business_id:businessId,p_success:false,p_transient:circuitTransientFailure} as never);const usage=usageOf(responseJson);await finishLog(admin,logId,startedAt,"provider_error",{providerStatus:lastProviderStatus,usage,errorCode:"AI_PROVIDER_ERROR"});return new Response(JSON.stringify({error:"AI_PROVIDER_ERROR"}),{status:502,headers:{...cors,"Content-Type":"application/json"}});}
    const usage=usageOf(responseJson);
    try{
      const outputText=extractOutputText(responseJson);if(!outputText)throw new Error("AI returned no text.");const parsed=parseJsonText(outputText);const result={headline:clampText(parsed.headline,52),subheadline:clampText(parsed.subheadline,90),caption:clampText(parsed.caption,550),cta:clampText(parsed.cta,45),visual_direction:clampText(parsed.visual_direction,220),requestId:correlationId};if(!result.headline||!result.caption)throw new Error("AI response was incomplete.");
      await admin.rpc("record_content_ai_provider_result" as never,{p_business_id:businessId,p_success:true,p_transient:false} as never);await finishLog(admin,logId,startedAt,"succeeded",{providerStatus:openai.status,usage});return new Response(JSON.stringify(result),{headers:{...cors,"Content-Type":"application/json"}});
    }catch(error){console.error("AI output validation",error instanceof Error?error.message:"unknown");await admin.rpc("record_content_ai_provider_result" as never,{p_business_id:businessId,p_success:false,p_transient:false} as never);await finishLog(admin,logId,startedAt,"invalid_output",{providerStatus:openai.status,usage,errorCode:"AI_INVALID_OUTPUT"});return new Response(JSON.stringify({error:"AI_INVALID_OUTPUT"}),{status:502,headers:{...cors,"Content-Type":"application/json"}});}
  }catch(error){console.error("nat-content-ai",error instanceof Error?error.message:"unknown");await finishLog(admin,logId,startedAt,"failed",{errorCode:"INTERNAL_ERROR"});return new Response(JSON.stringify({error:"INTERNAL_ERROR"}),{status:500,headers:{...cors,"Content-Type":"application/json"}});}
});
