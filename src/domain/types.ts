import type { FundingSource } from "./funding.js";

export type SupplyCategory = "ingredient" | "packaging" | "other";
export type Unit = "g" | "kg" | "ml" | "l" | "unit";
export type PaymentMethod = "pix" | "cash" | "card" | "other";
export type PaymentStatus = "paid" | "pending";
export type CustomerCreditStatus = "normal" | "critical";
export type SaleStatus = "completed" | "cancelled";
export type TransactionType = "sale" | "courtesy" | "personal_consumption" | "loss";
export type OwnerCashMovementType = "initial_capital" | "contribution" | "withdrawal";
export type SaleChannel = "whatsapp" | "instagram" | "street" | "referral" | "in_person" | "other";
export type PackagingFormat = "unit" | "quartet";

export type Supply = {id:string;name:string;category:SupplyCategory;packageQuantity:number;packageUnit:Unit;packagePrice:number;purchasedAt:string;fundingSource?:FundingSource;latestPurchaseId?:string|null;purchaseIntent?:"append"|"correct"|"metadata";};
export type RecipeItem = { id: string; supplyId: string; quantity: number; unit: Unit };
export type Product = {id:string;name:string;portfolioKey?:string|null;available?:boolean;batchYield:number;sellingPrice:number;lossPercent:number;laborCostPerBatch?:number;productionCostPerBatch:number;minimumMarginPercent:number;targetMarginPercent:number;recipe:RecipeItem[];};
export type Customer = {id:string;name:string;phone?:string|null;instagram?:string|null;source?:string|null;marketingConsent:boolean;notes?:string|null;active:boolean;creditStatus?:CustomerCreditStatus;createdAt:string;updatedAt:string;};
export type SaleLine = {id?:string;productId:string;productName:string;portfolioKey?:string|null;quantity:number;unitCostSnapshot:number;laborCostSnapshot?:number;unitPriceSnapshot:number;listUnitPriceSnapshot?:number;};
export type Sale = {id:string;productId:string;productName:string;portfolioKey?:string|null;customerId?:string|null;transactionType?:TransactionType;saleChannel?:SaleChannel;deliveryCostSnapshot?:number;packagingFormat?:PackagingFormat|null;packagingCostSnapshot?:number;discountReason?:string|null;belowCostOverride?:boolean;marginOverride?:boolean;quantity:number;totalReceived:number;saleValueSnapshot?:number;paymentStatus?:PaymentStatus;paymentPromisedDate?:string|null;paymentPromisedTime?:string|null;paymentDueAt?:string|null;paidAt?:string|null;paymentCriticalAt?:string|null;paymentMethod:PaymentMethod;soldAt:string;unitCostSnapshot:number;variableFeeSnapshot:number;contributionSnapshot:number;items:SaleLine[];status:SaleStatus;cancelledAt?:string|null;cancelReason?:string|null;};
export type SporadicExpense = {id:string;name:string;amount:number;spentAt:string;fundingSource?:FundingSource;};
export type OwnerCashMovement = {id:string;movementType:OwnerCashMovementType;amount:number;occurredAt:string;note?:string|null;createdAt?:string;updatedAt?:string;};
export type Settings = {ownerName:string;monthlyFixedCosts:number;paymentFeePercent:number;pixFeePercent?:number;cashFeePercent?:number;cardFeePercent?:number;defaultMinimumMarginPercent:number;defaultTargetMarginPercent:number;ownerHourlyRate?:number;ownerDailyHours?:number;fixedCostFundingSource?:FundingSource;timezone?:string;};
export type FinancialTruthSnapshot = {monthStart:string;billed:number;received:number;receivable:number;orders:number;paidOrders:number;pendingOrders:number;units:number;movementContribution:number;ownerRemuneration:number;};
export type NatState = {version:3|4|5|6;supplies:Supply[];products:Product[];customers?:Customer[];sales:Sale[];expenses:SporadicExpense[];ownerCashMovements?:OwnerCashMovement[];settings:Settings;purchaseCashOut?:number;financialTruth?:FinancialTruthSnapshot;};

export const initialState:NatState={version:6,supplies:[],products:[],customers:[],sales:[],expenses:[],ownerCashMovements:[],purchaseCashOut:0,settings:{ownerName:"NAT",monthlyFixedCosts:0,paymentFeePercent:0,pixFeePercent:0,cashFeePercent:0,cardFeePercent:0,defaultMinimumMarginPercent:35,defaultTargetMarginPercent:50,ownerHourlyRate:20,ownerDailyHours:3,fixedCostFundingSource:"owner",timezone:"America/Sao_Paulo"}};
export const unitLabel:Record<Unit,string>={g:"g",kg:"kg",ml:"ml",l:"L",unit:"un"};
export const paymentLabel:Record<PaymentMethod,string>={pix:"Pix",cash:"Dinheiro",card:"Cartão",other:"Outro"};
export const transactionTypeLabel:Record<TransactionType,string>={sale:"Venda",courtesy:"Cortesia",personal_consumption:"Consumo próprio",loss:"Perda"};
export const ownerCashMovementLabel:Record<OwnerCashMovementType,string>={initial_capital:"Capital inicial",contribution:"Novo aporte dos donos",withdrawal:"Retirada dos donos"};
export const saleChannelLabel:Record<SaleChannel,string>={whatsapp:"WhatsApp",instagram:"Instagram",street:"Rua",referral:"Indicação",in_person:"Presencial",other:"Não informado"};
