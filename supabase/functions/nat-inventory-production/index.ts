import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.99.2";

const allowedOrigins=["https://nat-gestao.lovable.app","https://id-preview--e8925812-e861-40fe-89fd-38bc287dafd9.lovable.app"];
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function corsHeaders(req:Request){const origin=req.headers.get("origin")??"";const allowed=allowedOrigins.includes(origin)||origin.startsWith("http://localhost:");return{"Access-Control-Allow-Origin":allowed?origin:allowedOrigins[0],"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-request-id","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};}
function getPublicKey(){return Deno.env.get("SUPABASE_ANON_KEY")??Deno.env.get("SUPABASE_PUBLISHABLE_KEY")??"";}
function json(status:number,payload:unknown,headers:Record<string,string>={}){return new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json",...headers}});}
function asNumber(value:unknown){const number=Number(value);return Number.isFinite(number)?number:NaN;}

type SnapshotItem={kind?:string;itemId?:string;currentQuantity?:number;minimumQuantity?:number};

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
    const businessId=typeof body?.businessId==="string"?body.businessId:"";const productId=typeof body?.productId==="string"?body.productId:"";const mode=body?.mode==="set_product_stock"?"set_product_stock":"production";
    const producedAt=typeof body?.producedAt==="string"?body.producedAt:new Date().toISOString();const note=typeof body?.note==="string"?body.note.trim().slice(0,500):null;const suppliedRequestId=typeof body?.requestId==="string"?body.requestId:req.headers.get("x-request-id")??"";const requestId=UUID_RE.test(suppliedRequestId)?suppliedRequestId:crypto.randomUUID();
    if(!businessId||!productId)return json(400,{error:"INVALID_INPUT",message:"Informe o produto."},cors);
    const membership=await client.from("business_members").select("role").eq("business_id",businessId).eq("user_id",user.data.user.id).maybeSingle();if(membership.error||!membership.data)return json(403,{error:"FORBIDDEN"},cors);
    const product=await client.from("products").select("id,name,batch_yield,active").eq("business_id",businessId).eq("id",productId).maybeSingle();if(product.error)throw product.error;if(!product.data||product.data.active!==true)return json(404,{error:"PRODUCT_NOT_FOUND"},cors);
    const batchYield=Number(product.data.batch_yield);if(!Number.isFinite(batchYield)||batchYield<=0)return json(409,{error:"INVALID_RECIPE_YIELD",message:"Defina primeiro o rendimento da receita deste produto."},cors);

    let batches=asNumber(body?.batches);let unitsProduced=asNumber(body?.unitsProduced);let targetQuantity:number|null=null;let minimumQuantity=0;
    if(mode==="set_product_stock"){
      targetQuantity=asNumber(body?.targetQuantity);minimumQuantity=asNumber(body?.minimumQuantity);
      if(!Number.isFinite(targetQuantity)||targetQuantity<0||!Number.isFinite(minimumQuantity)||minimumQuantity<0)return json(400,{error:"INVALID_INPUT",message:"Saldo e estoque mínimo precisam ser zero ou maiores."},cors);
      const snapshot=await client.rpc("get_inventory_snapshot" as never,{p_business_id:businessId} as never);if(snapshot.error)throw snapshot.error;
      const payload=snapshot.data as{items?:SnapshotItem[]}|null;const current=(payload?.items??[]).find((item)=>item.kind==="product"&&item.itemId===productId)?.currentQuantity??0;
      unitsProduced=Math.max(0,targetQuantity-current);batches=unitsProduced/batchYield;
      if(unitsProduced===0){const balance=await client.rpc("set_inventory_balance" as never,{p_business_id:businessId,p_item_kind:"product",p_item_id:productId,p_quantity:targetQuantity,p_minimum_quantity:minimumQuantity,p_note:note} as never);if(balance.error)throw balance.error;return json(200,{ok:true,requestId,productId,productName:product.data.name,previousQuantity:current,targetQuantity,unitsProduced:0,batches:0,mode},cors);}
    }else{
      if(Number.isFinite(batches)&&batches>0)unitsProduced=batchYield*batches;
      else if(Number.isFinite(unitsProduced)&&unitsProduced>0)batches=unitsProduced/batchYield;
    }
    if(!Number.isFinite(unitsProduced)||unitsProduced<=0||!Number.isFinite(batches)||batches<=0)return json(400,{error:"INVALID_INPUT",message:"Informe uma quantidade produzida maior que zero."},cors);
    const result=await client.rpc("record_inventory_production_v2" as never,{p_business_id:businessId,p_request_id:requestId,p_product_id:productId,p_batches:batches,p_produced_at:producedAt,p_note:note} as never);
    if(result.error){const status=/estoque insuficiente/i.test(result.error.message)?409:/receita|saldo inicial|unidade/i.test(result.error.message)?422:400;return json(status,{error:"PRODUCTION_REJECTED",message:result.error.message,requestId},cors);}
    if(mode==="set_product_stock"&&targetQuantity!==null){const balance=await client.rpc("set_inventory_balance" as never,{p_business_id:businessId,p_item_kind:"product",p_item_id:productId,p_quantity:targetQuantity,p_minimum_quantity:minimumQuantity,p_note:note} as never);if(balance.error)throw balance.error;}
    return json(200,{ok:true,requestId,productionId:result.data,productId,productName:product.data.name,unitsProduced,batches,targetQuantity,mode},cors);
  }catch(error){console.error("nat-inventory-production",error instanceof Error?error.message:"unknown");return json(500,{error:"INTERNAL_ERROR"},cors);}
});
