import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNatStore } from "@/hooks/use-nat-store";
import { dashboardNumbers, type Product, type Settings, type SporadicExpense, type Supply } from "@/domain/nat";
import type { CatalogItem, StarterSupply } from "@/domain/catalog";
import { AppShell, Brand, type NatView } from "@/components/nat/AppShell";
import { HomeView, PricingView, ProductsView, SalesView, type ProductTab } from "@/components/nat/Views";
import { PortfolioHierarchyView } from "@/components/nat/PortfolioHierarchyView";
import { BrandGuideView } from "@/components/nat/BrandGuideView";
import { CalendarView } from "@/components/nat/CalendarView";
import { ExpenseSheet, ProductSheet, SaleSheet, SettingsSheet, SupplySheet } from "@/components/nat/Sheets";

type Sheet =
  | { type:"sale" }
  | { type:"supply"; value?:Supply; preset?:StarterSupply }
  | { type:"product"; value?:Product; preset?:CatalogItem }
  | { type:"expense"; value?:SporadicExpense; presetName?:string }
  | { type:"settings" }
  | null;

export function NatApp({ view,onView }: { view:NatView; onView:(view:NatView)=>void }) {
  const { state,update,refresh,ready }=useNatStore(); const [productTab,setProductTab]=useState<ProductTab>("products"); const [sheet,setSheet]=useState<Sheet>(null); const numbers=useMemo(()=>dashboardNumbers(state),[state]);
  if(!ready) return <div className="min-h-screen grid place-items-center bg-cream"><div className="space-y-4 text-center"><Brand/><p className="text-sm text-caramel" role="status">Carregando dados protegidos...</p></div></div>;
  const saleState={...state,products:state.products.filter((product)=>product.recipe.length>0)};
  const openProducts=(tab:ProductTab)=>{setProductTab(tab);onView("products");};
  const logout=()=>void supabase.auth.signOut().finally(()=>{window.location.href="/";});
  return <AppShell view={view} onView={onView} onSale={()=>setSheet({type:"sale"})} onSettings={()=>setSheet({type:"settings"})} onLogout={logout}>
    {view==="home"&&<HomeView state={state} numbers={numbers} onSale={()=>setSheet({type:"sale"})} onSupplies={()=>openProducts("supplies")} onProducts={()=>openProducts("products")} onPricing={()=>onView("pricing")}/>} 
    {view==="sales"&&<SalesView state={state} onNew={()=>setSheet({type:"sale"})} onDelete={(saleId)=>update((current)=>({...current,sales:current.sales.filter((sale)=>sale.id!==saleId)}))}/>} 
    {view==="calendar"&&<CalendarView/>}
    {view==="portfolio"&&<PortfolioHierarchyView state={state} onConfigure={(preset)=>setSheet({type:"product",preset})} onEdit={(value)=>setSheet({type:"product",value})} onPricing={()=>onView("pricing")}/>} 
    {view==="products"&&<ProductsView state={state} tab={productTab} onTab={setProductTab} onNewSupply={(preset)=>setSheet({type:"supply",preset})} onEditSupply={(value)=>setSheet({type:"supply",value})} onDeleteSupply={(supplyId)=>{const used=state.products.some((product)=>product.recipe.some((item)=>item.supplyId===supplyId));if(used){window.alert("Esse item está em uma receita ativa. Retire-o do produto antes de excluir.");return;}update((current)=>({...current,supplies:current.supplies.filter((supply)=>supply.id!==supplyId)}));}} onNewProduct={(preset)=>setSheet({type:"product",preset})} onEditProduct={(value)=>setSheet({type:"product",value})} onDeleteProduct={(productId)=>update((current)=>({...current,products:current.products.filter((product)=>product.id!==productId)}))} onNewExpense={(presetName)=>setSheet({type:"expense",presetName})} onEditExpense={(value)=>setSheet({type:"expense",value})} onDeleteExpense={(expenseId)=>update((current)=>({...current,expenses:current.expenses.filter((expense)=>expense.id!==expenseId)}))}/>} 
    {view==="pricing"&&<PricingView state={state} onProducts={()=>openProducts("products")}/>} 
    {view==="identity"&&<BrandGuideView/>}
    {sheet?.type==="sale"&&<SaleSheet state={saleState} onClose={()=>setSheet(null)} onSave={(sale)=>{update((current)=>({...current,sales:[sale,...current.sales]}));setSheet(null);}}/>}
    {sheet?.type==="supply"&&<SupplySheet value={sheet.value} preset={sheet.preset} onClose={()=>setSheet(null)} onSave={(supply)=>{update((current)=>({...current,supplies:current.supplies.some((item)=>item.id===supply.id)?current.supplies.map((item)=>item.id===supply.id?supply:item):[...current.supplies,supply]}));setSheet(null);}}/>}
    {sheet?.type==="product"&&<ProductSheet state={state} value={sheet.value} preset={sheet.preset} onClose={()=>setSheet(null)} onSave={(product)=>{update((current)=>({...current,products:current.products.some((item)=>item.id===product.id)?current.products.map((item)=>item.id===product.id?product:item):[...current.products,product]}));setSheet(null);}}/>}
    {sheet?.type==="expense"&&<ExpenseSheet value={sheet.value} presetName={sheet.presetName} onClose={()=>setSheet(null)} onSave={(expense)=>{update((current)=>({...current,expenses:current.expenses.some((item)=>item.id===expense.id)?current.expenses.map((item)=>item.id===expense.id?expense:item):[expense,...current.expenses]}));setSheet(null);}}/>}
    {sheet?.type==="settings"&&<SettingsSheet value={state.settings} onClose={()=>setSheet(null)} onSave={(settings:Settings)=>{update((current)=>({...current,settings}));setSheet(null);}} onRefresh={refresh}/>} 
  </AppShell>;
}
