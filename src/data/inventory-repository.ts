import { supabase } from "@/integrations/supabase/client";
import { emptyInventorySnapshot, type InventoryBaseUnit, type InventoryCategory, type InventoryItem, type InventoryItemKind, type InventoryMovement, type InventoryMovementType, type InventorySnapshot } from "@/domain/inventory";

type UnknownRecord = Record<string,unknown>;

const record = (value:unknown):UnknownRecord => value && typeof value==="object" && !Array.isArray(value) ? value as UnknownRecord : {};
const text = (value:unknown,fallback="") => typeof value==="string" ? value : fallback;
const numberValue = (value:unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const bool = (value:unknown) => value===true;
const array = (value:unknown):unknown[] => Array.isArray(value)?value:[];

function itemFrom(value:unknown):InventoryItem {
  const row=record(value);
  const kind=text(row.kind)==="product"?"product":"supply" as InventoryItemKind;
  const categoryValue=text(row.category);
  const category:InventoryCategory=categoryValue==="product"||categoryValue==="packaging"||categoryValue==="other"?categoryValue:"ingredient";
  const baseValue=text(row.baseUnit);
  const baseUnit:InventoryBaseUnit=baseValue==="g"||baseValue==="ml"?baseValue:"unit";
  return {
    kind,itemId:text(row.itemId),name:text(row.name,"Item"),category,tracked:bool(row.tracked),
    currentQuantity:numberValue(row.currentQuantity),minimumQuantity:numberValue(row.minimumQuantity),baseUnit,
    lowStock:bool(row.lowStock),lastMovementAt:row.lastMovementAt==null?null:text(row.lastMovementAt),
  };
}

function movementFrom(value:unknown):InventoryMovement {
  const row=record(value);
  const kind=text(row.kind)==="product"?"product":"supply" as InventoryItemKind;
  const baseValue=text(row.baseUnit);
  const baseUnit:InventoryBaseUnit=baseValue==="g"||baseValue==="ml"?baseValue:"unit";
  const movement=text(row.movementType) as InventoryMovementType;
  const valid:InventoryMovementType[]=["opening","purchase","production_in","production_out","sale","sale_cancel","adjustment"];
  return {
    id:text(row.id),kind,itemId:text(row.itemId),itemName:text(row.itemName,"Item"),quantityDelta:numberValue(row.quantityDelta),baseUnit,
    movementType:valid.includes(movement)?movement:"adjustment",note:row.note==null?null:text(row.note),occurredAt:text(row.occurredAt),
  };
}

function fail(context:string,error:{message:string}|null) { if(error) throw new Error(`${context}: ${error.message}`); }
function retryable(message:string){return /fetch|network|timeout|Failed to fetch/i.test(message);}

export async function loadInventorySnapshot(businessId:string):Promise<InventorySnapshot> {
  const result=await supabase.rpc("get_inventory_snapshot",{p_business_id:businessId});
  fail("Não foi possível carregar o estoque",result.error);
  const payload=record(result.data);
  if(!Object.keys(payload).length) return emptyInventorySnapshot();
  return {items:array(payload.items).map(itemFrom),movements:array(payload.movements).map(movementFrom)};
}

export async function setInventoryBalance(args:{businessId:string;kind:InventoryItemKind;itemId:string;quantity:number;minimumQuantity:number;note?:string}) {
  if(args.kind==="product"){
    const requestId=crypto.randomUUID();
    const result=await supabase.functions.invoke("nat-inventory-production",{body:{mode:"set_product_stock",businessId:args.businessId,productId:args.itemId,targetQuantity:args.quantity,minimumQuantity:args.minimumQuantity,note:args.note?.trim()||null,requestId}});
    if(result.error)throw new Error(`Não foi possível atualizar o estoque: ${result.error.message}`);
    const payload=record(result.data);if(payload.ok!==true)throw new Error(`Não foi possível atualizar o estoque: ${text(payload.message,"revise a receita e o saldo dos ingredientes.")}`);
    return;
  }
  const result=await supabase.rpc("set_inventory_balance",{
    p_business_id:args.businessId,p_item_kind:args.kind,p_item_id:args.itemId,p_quantity:args.quantity,p_minimum_quantity:args.minimumQuantity,p_note:args.note?.trim()||null,
  });
  fail("Não foi possível atualizar o estoque",result.error);
}

export async function recordInventoryProduction(args:{businessId:string;productId:string;batches:number;producedAt:string;note?:string}) {
  const requestId=crypto.randomUUID();
  let lastError:{message:string}|null=null;
  for(let attempt=0;attempt<2;attempt+=1){
    const result=await supabase.functions.invoke("nat-inventory-production",{body:{mode:"production",businessId:args.businessId,productId:args.productId,batches:args.batches,producedAt:args.producedAt,note:args.note?.trim()||null,requestId}});
    if(!result.error){const payload=record(result.data);if(payload.ok===true)return payload.productionId??null;lastError={message:text(payload.message,"Não foi possível registrar a produção.")};}
    else lastError={message:result.error.message};
    if(!lastError||!retryable(lastError.message))break;
  }
  fail("Não foi possível registrar a produção",lastError);
  return null;
}
