import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.99.2";

const allowedOrigins=["https://nat-gestao.lovable.app","https://id-preview--e8925812-e861-40fe-89fd-38bc287dafd9.lovable.app"];
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Mode="production"|"set_product_stock"|"mass_production"|"brigadeiro_production";

function corsHeaders(req:Request){const origin=req.headers.get("origin")??"";const allowed=allowedOrigins.includes(origin)||origin.startsWith("http://localhost:");return{"Access-Control-Allow-Origin":allowed?origin:allowedOrigins[0],"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-request-id","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};}
function getPublicKey(){return Deno.env.get("SUPABASE_ANON_KEY")??Deno.env.get("SUPABASE_PUBLISHABLE_KEY")??"";}
function json(status:number,payload:unknown,headers:Record<string,string>={}){return new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json",...headers}});}
function asNumber(value:unknown){const number=Number(value);return Number.isFinite(number)?number:NaN;}
function record(value:unknown){return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function modeFrom(value:unknown):Mode{return value==="set_product_stock"||value==="mass_production"||value==="brigadeiro_production"?value:"production";}
function statusForProductionError(message:string){return /estoque insuficiente/i.test(message)?409:/receita|saldo inicial|unidade|massa|embalagem|liberad/i.test(message)?422:/REQUEST_ID_REUSED/i.test(message)?409:400;}

Deno.serve(async(req)=>{
  const cors=corsHeaders(req);
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json(405,{error:"METHOD_NOT_ALLOWED"},cors);
  try{
    const auth=req.headers.get("authorization")??"";const token=auth.replace(/^Bearer\s+/i,"");
    if(!token)return json(401,{error:"UNAUTHORIZED"},cors);
    const url=Deno.env.get("SUPABASE_URL")??"";const key=getPublicKey();if(!url||!key)throw new Error("Supabase public configuration is unavailable.");
    const client=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
    const user=await client.auth.getUser(token);if(user.error||!user.data.user)return json(401,{error:"UNAUTHORIZED"},cors);
    const body=await req.json().catch(()=>({}));
    const businessId=typeof body?.businessId==="string"?body.businessId:"";const productId=typeof body?.productId==="string"?body.productId:"";const mode=modeFrom(body?.mode);
    const producedAt=typeof body?.producedAt==="string"?body.producedAt:new Date().toISOString();const note=typeof body?.note==="string"?body.note.trim().slice(0,500):null;const suppliedRequestId=typeof body?.requestId==="string"?body.requestId:req.headers.get("x-request-id")??"";const requestId=UUID_RE.test(suppliedRequestId)?suppliedRequestId:crypto.randomUUID();
    if(!businessId)return json(400,{error:"INVALID_INPUT",message:"Informe o negócio."},cors);
    const membership=await client.from("business_members").select("role").eq("business_id",businessId).eq("user_id",user.data.user.id).maybeSingle();if(membership.error||!membership.data)return json(403,{error:"FORBIDDEN"},cors);

    if(mode==="mass_production"){
      const massKey=typeof body?.massKey==="string"?body.massKey:"";const batches=asNumber(body?.batches);
      if(!massKey||!Number.isInteger(batches)||batches<=0)return json(400,{error:"INVALID_INPUT",message:"Escolha a massa e informe uma quantidade inteira de receitas."},cors);
      const result=await client.rpc("record_brigadeiro_mass_production_v1" as never,{p_business_id:businessId,p_request_id:requestId,p_mass_key:massKey,p_batches:batches,p_produced_at:producedAt,p_note:note} as never);
      if(result.error)return json(statusForProductionError(result.error.message),{error:"MASS_PRODUCTION_REJECTED",message:result.error.message,requestId},cors);
      return json(200,{ok:true,requestId,productionId:result.data,massKey,batches,gramsProduced:batches*800,mode},cors);
    }

    if(!productId)return json(400,{error:"INVALID_INPUT",message:"Informe o produto."},cors);
    const product=await client.from("products").select("id,name,batch_yield,active,portfolio_key").eq("business_id",businessId).eq("id",productId).maybeSingle();if(product.error)throw product.error;if(!product.data||product.data.active!==true)return json(404,{error:"PRODUCT_NOT_FOUND"},cors);

    if(mode==="brigadeiro_production"){
      const units=asNumber(body?.unitsProduced);
      if(!Number.isInteger(units)||units<=0)return json(400,{error:"INVALID_INPUT",message:"Informe uma quantidade inteira de brigadeiros."},cors);
      const result=await client.rpc("record_brigadeiro_production_v1" as never,{p_business_id:businessId,p_request_id:requestId,p_product_id:productId,p_units:units,p_produced_at:producedAt,p_note:note} as never);
      if(result.error)return json(statusForProductionError(result.error.message),{error:"BRIGADEIRO_PRODUCTION_REJECTED",message:result.error.message,requestId},cors);
      return json(200,{ok:true,requestId,productionId:result.data,productId,productName:product.data.name,unitsProduced:units,batches:units,mode},cors);
    }

    const batchYield=Number(product.data.batch_yield);if(!Number.isFinite(batchYield)||batchYield<=0)return json(409,{error:"INVALID_RECIPE_YIELD",message:"Defina primeiro o rendimento da receita deste produto."},cors);
    if(mode==="set_product_stock"){
      const targetQuantity=asNumber(body?.targetQuantity);const minimumQuantity=asNumber(body?.minimumQuantity);
      if(!Number.isFinite(targetQuantity)||targetQuantity<0||!Number.isFinite(minimumQuantity)||minimumQuantity<0)return json(400,{error:"INVALID_INPUT",message:"Saldo e estoque mínimo precisam ser zero ou maiores."},cors);
      const result=await client.rpc("set_product_stock_v2" as never,{p_business_id:businessId,p_request_id:requestId,p_product_id:productId,p_target_quantity:targetQuantity,p_minimum_quantity:minimumQuantity,p_produced_at:producedAt,p_note:note} as never);
      if(result.error){const insufficientStock=/estoque insuficiente/i.test(result.error.message);const status=insufficientStock?409:/receita|unidade|rendimento|saldo/i.test(result.error.message)?422:/conflict/i.test(result.error.message)?409:400;return json(status,{error:"STOCK_TARGET_REJECTED",...(insufficientStock?{reason:"INSUFFICIENT_STOCK"}:{}),message:result.error.message,requestId},cors);}
      const stock=record(result.data);return json(200,{ok:true,requestId,productId,productName:product.data.name,targetQuantity,mode,...stock},cors);
    }
    let batches=asNumber(body?.batches);let unitsProduced=asNumber(body?.unitsProduced);
    if(Number.isFinite(batches)&&batches>0)unitsProduced=batchYield*batches;else if(Number.isFinite(unitsProduced)&&unitsProduced>0)batches=unitsProduced/batchYield;
    if(!Number.isFinite(unitsProduced)||unitsProduced<=0||!Number.isFinite(batches)||batches<=0)return json(400,{error:"INVALID_INPUT",message:"Informe uma quantidade produzida maior que zero."},cors);
    const result=await client.rpc("record_inventory_production_v2" as never,{p_business_id:businessId,p_request_id:requestId,p_product_id:productId,p_batches:batches,p_produced_at:producedAt,p_note:note} as never);
    if(result.error)return json(statusForProductionError(result.error.message),{error:"PRODUCTION_REJECTED",message:result.error.message,requestId},cors);
    return json(200,{ok:true,requestId,productionId:result.data,productId,productName:product.data.name,unitsProduced,batches,targetQuantity:null,mode},cors);
  }catch(error){console.error("nat-inventory-production",error instanceof Error?error.message:"unknown");return json(500,{error:"INTERNAL_ERROR"},cors);}
});
