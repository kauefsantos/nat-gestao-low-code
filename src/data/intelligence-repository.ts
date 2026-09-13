import { supabase } from "@/integrations/supabase/client";

const numberValue=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;
const nullableNumber=(value:unknown)=>value==null||!Number.isFinite(Number(value))?null:Number(value);
const rows=(value:unknown)=>Array.isArray(value)?value:[];
const record=(value:unknown)=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};

export type PurchaseBrandInsight={supplyId:string;name:string;current:boolean;purchases:number;totalSpent:number;lastDate:string;lastPackagePrice:number;lastUnitCost:number;stockQuantity:number|null;baseUnit:string|null};
export type PurchaseInsight={groupId:string;name:string;category:string;purchases:number;totalSpent:number;currentUnitCost:number;previousUnitCost:number|null;variation:number|null;stockQuantity:number;baseUnit:string|null;brands:PurchaseBrandInsight[]};

function parseBrand(value:unknown):PurchaseBrandInsight{const row=record(value);return{supplyId:String(row.supplyId??""),name:String(row.name??"Marca"),current:row.current===true,purchases:numberValue(row.purchases),totalSpent:numberValue(row.totalSpent),lastDate:String(row.lastDate??""),lastPackagePrice:numberValue(row.lastPackagePrice),lastUnitCost:numberValue(row.lastUnitCost),stockQuantity:nullableNumber(row.stockQuantity),baseUnit:row.baseUnit==null?null:String(row.baseUnit)};}
function parseInsight(value:unknown):PurchaseInsight{const row=record(value);return{groupId:String(row.groupId??""),name:String(row.name??"Insumo"),category:String(row.category??"other"),purchases:numberValue(row.purchases),totalSpent:numberValue(row.totalSpent),currentUnitCost:numberValue(row.currentUnitCost),previousUnitCost:nullableNumber(row.previousUnitCost),variation:nullableNumber(row.variation),stockQuantity:numberValue(row.stockQuantity),baseUnit:row.baseUnit==null?null:String(row.baseUnit),brands:rows(row.brands).map(parseBrand)};}

export async function loadSupplyPurchaseInsights(businessId:string):Promise<PurchaseInsight[]>{
  const result=await supabase.functions.invoke("nat-analysis-insights",{body:{businessId,mode:"purchases"}});
  if(result.error)throw new Error(`Não foi possível carregar compras: ${result.error.message}`);
  const payload=record(result.data);
  return rows(payload.purchases).map(parseInsight);
}
