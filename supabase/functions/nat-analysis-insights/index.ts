import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.99.2";

const allowedOrigins=["https://nat-gestao.lovable.app","https://id-preview--e8925812-e861-40fe-89fd-38bc287dafd9.lovable.app"];
type AnalysisMode="snapshot"|"purchases";
type JsonRecord=Record<string,unknown>;

function corsHeaders(req:Request){const origin=req.headers.get("origin")??"";const allowed=allowedOrigins.includes(origin)||origin.startsWith("http://localhost:");return{"Access-Control-Allow-Origin":allowed?origin:allowedOrigins[0],"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};}
function getPublicKey(){return Deno.env.get("SUPABASE_ANON_KEY")??Deno.env.get("SUPABASE_PUBLISHABLE_KEY")??"";}
function json(status:number,payload:unknown,headers:Record<string,string>={}){return new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json",...headers}});}
function record(value:unknown):JsonRecord{return value&&typeof value==="object"&&!Array.isArray(value)?value as JsonRecord:{};}
function rows(value:unknown):unknown[]{return Array.isArray(value)?value:[];}
function numberValue(value:unknown){const number=Number(value);return Number.isFinite(number)?number:0;}
function modeFrom(value:unknown):AnalysisMode{return value==="purchases"?"purchases":"snapshot";}

function emptyProduct(product:{id:string;name:string}){return{productId:product.id,name:product.name,units:0,orders:0,billed:0,productCost:0,labor:0,allocatedFee:0,allocatedDelivery:0,contribution:0,marginPercent:0,averageOrderTicket:0,investedCost:0,netReturn:0,roiPercent:null};}
function shapePortfolioProducts(snapshot:JsonRecord,portfolio:{id:string;name:string}[]){
  const byId=new Map(rows(snapshot.products).map((value)=>{const row=record(value);return[String(row.productId??""),row] as const;}));
  return portfolio.map((product)=>{
    const metric=byId.get(product.id);if(!metric)return emptyProduct(product);
    return{productId:product.id,name:product.name,units:numberValue(metric.units),orders:numberValue(metric.orders),billed:numberValue(metric.billed),productCost:numberValue(metric.productCost),labor:numberValue(metric.labor),allocatedFee:numberValue(metric.allocatedFee),allocatedDelivery:numberValue(metric.allocatedDelivery),contribution:numberValue(metric.contribution),marginPercent:numberValue(metric.marginPercent),averageOrderTicket:numberValue(metric.averageOrderTicket),investedCost:numberValue(metric.investedCost),netReturn:numberValue(metric.netReturn),roiPercent:metric.roiPercent==null?null:numberValue(metric.roiPercent)};
  });
}

Deno.serve(async(req)=>{
  const cors=corsHeaders(req);
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json(405,{error:"METHOD_NOT_ALLOWED"},cors);
  try{
    const auth=req.headers.get("authorization")??"";const token=auth.replace(/^Bearer\s+/i,"");
    if(!token)return json(401,{error:"UNAUTHORIZED"},cors);
    const url=Deno.env.get("SUPABASE_URL")??"";const key=getPublicKey();if(!url||!key)throw new Error("Lovable Cloud public configuration is unavailable.");
    const client=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
    const user=await client.auth.getUser(token);if(user.error||!user.data.user)return json(401,{error:"UNAUTHORIZED"},cors);
    const body=record(await req.json().catch(()=>({})));const businessId=typeof body.businessId==="string"?body.businessId:"";const mode=modeFrom(body.mode);
    if(!businessId)return json(400,{error:"INVALID_INPUT",message:"Informe o negócio."},cors);
    const membership=await client.from("business_members").select("role").eq("business_id",businessId).eq("user_id",user.data.user.id).maybeSingle();
    if(membership.error||!membership.data)return json(403,{error:"FORBIDDEN"},cors);

    if(mode==="purchases"){
      const purchaseResult=await client.rpc("get_analysis_supply_groups_v1" as never,{p_business_id:businessId} as never);
      if(purchaseResult.error)return json(400,{error:"PURCHASE_ANALYSIS_FAILED",message:purchaseResult.error.message},cors);
      return json(200,{purchases:Array.isArray(purchaseResult.data)?purchaseResult.data:[]},cors);
    }

    const [snapshotResult,portfolioResult]=await Promise.all([
      client.rpc("get_business_intelligence_snapshot_v2" as never,{p_business_id:businessId} as never),
      client.from("products").select("id,name").eq("business_id",businessId).eq("active",true).order("name"),
    ]);
    if(snapshotResult.error)return json(400,{error:"SNAPSHOT_FAILED",message:snapshotResult.error.message},cors);
    if(portfolioResult.error)return json(400,{error:"PORTFOLIO_FAILED",message:portfolioResult.error.message},cors);
    const snapshot=record(snapshotResult.data);const portfolio=(portfolioResult.data??[]).map((row)=>({id:String(row.id),name:String(row.name)}));
    return json(200,{snapshot:{...snapshot,products:shapePortfolioProducts(snapshot,portfolio)}},cors);
  }catch(error){console.error("nat-analysis-insights",error instanceof Error?error.message:"unknown");return json(500,{error:"INTERNAL_ERROR"},cors);}
});
