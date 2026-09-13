import { supabase } from "@/integrations/supabase/client";
import type { SaleChannel } from "@/domain/nat";

const numberValue=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;
const rows=(value:unknown)=>Array.isArray(value)?value:[];
const record=(value:unknown)=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};

export type BiProduct={productId:string;name:string;units:number;orders:number;billed:number;productCost:number;labor:number;allocatedFee:number;allocatedDelivery:number;contribution:number;marginPercent:number;averageOrderTicket:number};
export type BiChannel={channel:SaleChannel;orders:number;billed:number;received:number;contribution:number;ticket:number};
export type BiCustomer={customerId:string;name:string;source:string|null;firstPurchase:string;lastPurchase:string;orders:number;billed:number;received:number;averageTicket:number;units:number;daysSinceLast:number;recurring:boolean;favoriteProduct:string|null;nonCommercialInteractions:number;contribution:number;marginPercent:number;recencyScore:number;frequencyScore:number;valueScore:number;rfmTotal:number;segment:"Novo"|"Recorrente"|"VIP"|"Em risco"|"Inativo"};
export type BiCohort={cohort:string;customers:number;repurchased:number;repurchaseRate:number};
export type BiPair={a:string;b:string;count:number};
export type BusinessIntelligenceSnapshot={
  readiness:{ready:boolean;salesCount:number;distinctSalesDays:number;minimumSales:number;minimumDays:number;missingSales:number;missingDays:number};
  products:BiProduct[];channels:BiChannel[];customers:BiCustomer[];
  overview:{customersWithOrders:number;recurrent:number;inactive:number;newThisMonth:number;repurchaseRate:number;averageTicket:number};
  cohorts:BiCohort[];pairs:BiPair[];secondPurchase:{sample:number;days:number|null;baseSmall:boolean};
  promotions:{discountedOrders:number;discountValue:number;contribution:number};
};

function parseProduct(value:unknown):BiProduct{const row=record(value);return{productId:String(row.productId??""),name:String(row.name??"Produto"),units:numberValue(row.units),orders:numberValue(row.orders),billed:numberValue(row.billed),productCost:numberValue(row.productCost),labor:numberValue(row.labor),allocatedFee:numberValue(row.allocatedFee),allocatedDelivery:numberValue(row.allocatedDelivery),contribution:numberValue(row.contribution),marginPercent:numberValue(row.marginPercent),averageOrderTicket:numberValue(row.averageOrderTicket)};}
function parseChannel(value:unknown):BiChannel{const row=record(value);return{channel:(row.channel??"other") as SaleChannel,orders:numberValue(row.orders),billed:numberValue(row.billed),received:numberValue(row.received),contribution:numberValue(row.contribution),ticket:numberValue(row.ticket)};}
function parseCustomer(value:unknown):BiCustomer{const row=record(value);return{customerId:String(row.customerId??""),name:String(row.name??"Cliente"),source:row.source==null?null:String(row.source),firstPurchase:String(row.firstPurchase??""),lastPurchase:String(row.lastPurchase??""),orders:numberValue(row.orders),billed:numberValue(row.billed),received:numberValue(row.received),averageTicket:numberValue(row.averageTicket),units:numberValue(row.units),daysSinceLast:numberValue(row.daysSinceLast),recurring:row.recurring===true,favoriteProduct:row.favoriteProduct==null?null:String(row.favoriteProduct),nonCommercialInteractions:numberValue(row.nonCommercialInteractions),contribution:numberValue(row.contribution),marginPercent:numberValue(row.marginPercent),recencyScore:numberValue(row.recencyScore),frequencyScore:numberValue(row.frequencyScore),valueScore:numberValue(row.valueScore),rfmTotal:numberValue(row.rfmTotal),segment:(row.segment??"Novo") as BiCustomer["segment"]};}
function parseCohort(value:unknown):BiCohort{const row=record(value);return{cohort:String(row.cohort??""),customers:numberValue(row.customers),repurchased:numberValue(row.repurchased),repurchaseRate:numberValue(row.repurchaseRate)};}
function parsePair(value:unknown):BiPair{const row=record(value);return{a:String(row.a??""),b:String(row.b??""),count:numberValue(row.count)};}

// Only concurrent consumers share a request. Once it settles the entry disappears, so
// a new sale, settlement, customer edit or product-price change can never be masked by
// a long-lived browser cache.
const inFlight=new Map<string,Promise<BusinessIntelligenceSnapshot>>();
async function fetchSnapshot(businessId:string):Promise<BusinessIntelligenceSnapshot>{
  const result=await supabase.rpc("get_business_intelligence_snapshot_v1" as never,{p_business_id:businessId} as never);
  if(result.error)throw new Error(`Não foi possível carregar a inteligência completa: ${result.error.message}`);
  const root=record(result.data);const readiness=record(root.readiness);const overview=record(root.overview);const second=record(root.secondPurchase);const promotions=record(root.promotions);
  return{
    readiness:{ready:readiness.ready===true,salesCount:numberValue(readiness.salesCount),distinctSalesDays:numberValue(readiness.distinctSalesDays),minimumSales:numberValue(readiness.minimumSales)||10,minimumDays:numberValue(readiness.minimumDays)||7,missingSales:numberValue(readiness.missingSales),missingDays:numberValue(readiness.missingDays)},
    products:rows(root.products).map(parseProduct),channels:rows(root.channels).map(parseChannel),customers:rows(root.customers).map(parseCustomer),
    overview:{customersWithOrders:numberValue(overview.customersWithOrders),recurrent:numberValue(overview.recurrent),inactive:numberValue(overview.inactive),newThisMonth:numberValue(overview.newThisMonth),repurchaseRate:numberValue(overview.repurchaseRate),averageTicket:numberValue(overview.averageTicket)},
    cohorts:rows(root.cohorts).map(parseCohort),pairs:rows(root.pairs).map(parsePair),secondPurchase:{sample:numberValue(second.sample),days:second.days==null?null:numberValue(second.days),baseSmall:second.baseSmall===true},
    promotions:{discountedOrders:numberValue(promotions.discountedOrders),discountValue:numberValue(promotions.discountValue),contribution:numberValue(promotions.contribution)},
  };
}
export function loadBusinessIntelligenceSnapshot(businessId:string,{refresh=false}:{refresh?:boolean}={}):Promise<BusinessIntelligenceSnapshot>{
  if(refresh)inFlight.delete(businessId);
  const existing=inFlight.get(businessId);if(existing)return existing;
  const request=fetchSnapshot(businessId).finally(()=>{if(inFlight.get(businessId)===request)inFlight.delete(businessId);});inFlight.set(businessId,request);return request;
}
export function invalidateBusinessIntelligenceSnapshot(businessId:string){inFlight.delete(businessId);}
