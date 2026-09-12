import { activeSaleLines, monthSales, type NatState } from "./nat.js";

export type ProductRoi = {
  productId: string;
  name: string;
  units: number;
  revenue: number;
  investedCost: number;
  netReturn: number;
  roiPercent: number;
};

export type BusinessRoi = {
  revenue: number;
  investedCost: number;
  netReturn: number;
  roiPercent: number;
};

function safeRoi(netReturn:number,investedCost:number){
  return investedCost>0?netReturn/investedCost*100:Number.NaN;
}

export function productRoiAnalytics(state:NatState):ProductRoi[]{
  const map=new Map<string,ProductRoi>();
  const sales=state.sales.filter((sale)=>sale.status!=="cancelled"&&(sale.transactionType??"sale")==="sale");
  for(const sale of sales){
    const lines=activeSaleLines(sale);
    const revenueBase=lines.reduce((sum,line)=>sum+line.unitPriceSnapshot*line.quantity,0)||sale.totalReceived||1;
    for(const line of lines){
      const revenue=line.unitPriceSnapshot*line.quantity;
      const share=revenueBase>0?revenue/revenueBase:1/lines.length;
      const productCost=line.unitCostSnapshot*line.quantity;
      const fee=(sale.variableFeeSnapshot??0)*share;
      const delivery=(sale.deliveryCostSnapshot??0)*share;
      const investedCost=productCost+fee+delivery;
      const netReturn=revenue-investedCost;
      const current=map.get(line.productId)??{productId:line.productId,name:line.productName,units:0,revenue:0,investedCost:0,netReturn:0,roiPercent:Number.NaN};
      current.units+=line.quantity;
      current.revenue+=revenue;
      current.investedCost+=investedCost;
      current.netReturn+=netReturn;
      current.roiPercent=safeRoi(current.netReturn,current.investedCost);
      map.set(line.productId,current);
    }
  }
  return [...map.values()].sort((a,b)=>Number.isFinite(b.roiPercent)&&Number.isFinite(a.roiPercent)?b.roiPercent-a.roiPercent:b.netReturn-a.netReturn);
}

export function businessRoi(state:NatState,now=new Date()):BusinessRoi{
  const sales=monthSales(state.sales,now).filter((sale)=>(sale.transactionType??"sale")==="sale");
  let revenue=0;let variableInvestment=0;
  for(const sale of sales){
    revenue+=sale.totalReceived;
    variableInvestment+=activeSaleLines(sale).reduce((sum,line)=>sum+line.unitCostSnapshot*line.quantity,0);
    variableInvestment+=Math.max(0,sale.variableFeeSnapshot??0)+Math.max(0,sale.deliveryCostSnapshot??0);
  }
  const monthKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const sporadic=state.expenses.filter((expense)=>expense.spentAt.slice(0,7)===monthKey).reduce((sum,expense)=>sum+expense.amount,0);
  const investedCost=variableInvestment+Math.max(0,state.settings.monthlyFixedCosts)+sporadic;
  const netReturn=revenue-investedCost;
  return {revenue,investedCost,netReturn,roiPercent:safeRoi(netReturn,investedCost)};
}
