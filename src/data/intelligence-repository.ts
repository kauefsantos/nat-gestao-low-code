import { supabase } from "@/integrations/supabase/client";
import type { Supply, Unit } from "@/domain/nat";

type PurchaseRow={supply_id:string;package_quantity:number|string;package_unit:Unit;package_price:number|string;purchased_at:string;created_at:string};
export type PurchaseInsight={supplyId:string;name:string;lastDate:string;currentUnitCost:number;previousUnitCost:number|null;variation:number|null;totalSpent:number;purchases:number};

function baseQty(quantity:number,unit:Unit){if(unit==="kg")return quantity*1000;if(unit==="l")return quantity*1000;return quantity;}
function purchaseUnitCost(row:PurchaseRow){const quantity=baseQty(Number(row.package_quantity),row.package_unit);return quantity>0?Number(row.package_price)/quantity:0;}

export async function loadSupplyPurchaseInsights(businessId:string,supplies:Supply[]):Promise<PurchaseInsight[]>{
  const result=await supabase.from("supply_purchases").select("supply_id,package_quantity,package_unit,package_price,purchased_at,created_at").eq("business_id",businessId).order("purchased_at",{ascending:false}).order("created_at",{ascending:false});
  if(result.error)throw new Error(`Não foi possível carregar compras: ${result.error.message}`);
  const rows=(result.data??[]) as PurchaseRow[];
  const bySupply=new Map<string,PurchaseRow[]>();
  for(const row of rows){const list=bySupply.get(row.supply_id)??[];list.push(row);bySupply.set(row.supply_id,list);}
  return [...bySupply.entries()].map(([supplyId,list])=>{
    const supply=supplies.find((item)=>item.id===supplyId);
    const current=purchaseUnitCost(list[0]);
    const previous=list[1]?purchaseUnitCost(list[1]):null;
    return {supplyId,name:supply?.name??"Insumo",lastDate:list[0].purchased_at,currentUnitCost:current,previousUnitCost:previous,variation:previous&&previous>0?(current-previous)/previous*100:null,totalSpent:list.reduce((sum,item)=>sum+Number(item.package_price),0),purchases:list.length};
  }).sort((a,b)=>Math.abs(b.variation??0)-Math.abs(a.variation??0));
}
