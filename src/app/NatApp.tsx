import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNatStore } from "@/hooks/use-nat-store";
import { useInventory } from "@/hooks/use-inventory";
import { useCalendar } from "@/hooks/use-calendar";
import { dashboardNumbers, id, type Customer, type OwnerCashMovement, type Product, type Settings, type SporadicExpense, type Supply } from "@/domain/nat";
import type { CatalogItem, StarterSupply } from "@/domain/catalog";
import { AppShell, Brand, type NatView } from "@/components/nat/AppShell";
import { HomeView, PricingView } from "@/components/nat/Views";
import { HomeOperations } from "@/components/nat/HomeOperations";
import { ProductsView, type ProductTab } from "@/components/nat/ProductsView";
import { SalesHistoryView } from "@/components/nat/SalesHistoryView";
import { SaleOrderSheet } from "@/components/nat/SaleOrderSheet";
import { CustomersView } from "@/components/nat/CustomersView";
import { PortfolioHierarchyView } from "@/components/nat/PortfolioHierarchyView";
import { BrandGuideView } from "@/components/nat/BrandGuideView";
import { CalendarView } from "@/components/nat/CalendarView";
import { InventoryView } from "@/components/nat/InventoryView";
import { StatusToast, type AppNotice } from "@/components/nat/Feedback";
import { SupplySheet } from "@/components/nat/SupplySheet";
import { ExpenseSheet, ProductSheet, SettingsSheet } from "@/components/nat/Sheets";
import { OwnerCashMovementSheet } from "@/components/nat/OwnerCashMovementSheet";
import { installGlobalDiagnostics, recordDiagnostic } from "@/lib/telemetry";

type Sheet =
  | { type:"sale" }
  | { type:"supply"; value?:Supply; preset?:StarterSupply }
  | { type:"product"; value?:Product; preset?:CatalogItem }
  | { type:"expense"; value?:SporadicExpense; presetName?:string }
  | { type:"ownerCash"; value?:OwnerCashMovement }
  | { type:"settings" }
  | null;

export function NatApp({ view,onView }: { view:NatView; onView:(view:NatView)=>void }) {
  const { state,update,setProductAvailability,refresh,ready,loadError,syncNotice,clearSyncNotice,syncRevision,businessId }=useNatStore();
  const inventory=useInventory(businessId,syncRevision);
  const homeCalendar=useCalendar(view==="home");
  const [productTab,setProductTab]=useState<ProductTab>("products");
  const [sheet,setSheet]=useState<Sheet>(null);
  const [localNotice,setLocalNotice]=useState<AppNotice>(null);
  const numbers=useMemo(()=>dashboardNumbers(state),[state]);
  useEffect(()=>installGlobalDiagnostics(),[]);
  useEffect(()=>{if(loadError)recordDiagnostic(`Falha ao carregar dados: ${loadError}`);},[loadError]);

  if(!ready) return <div className="min-h-screen grid place-items-center bg-cream"><div className="space-y-4 text-center"><Brand/><p className="text-sm text-caramel" role="status">Carregando dados protegidos...</p></div></div>;
  if(loadError) return <div className="min-h-screen grid place-items-center bg-cream p-5"><div className="nat-card max-w-md text-center"><div className="mx-auto w-fit"><Brand/></div><h1 className="mt-6 font-display text-3xl">Não conseguimos abrir seus dados</h1><p className="mt-2 text-sm leading-6 text-caramel">{loadError}</p><button type="button" className="primary-button mt-5 w-full justify-center" onClick={refresh}>Tentar novamente</button></div></div>;

  const saleState={...state,products:state.products.filter((product)=>product.available!==false&&product.recipe.length>0)};
  const homeState={...state,sales:state.sales.filter((sale)=>sale.status!=="cancelled")};
  const openProducts=(tab:ProductTab)=>{setProductTab(tab);onView("products");};
  const logout=()=>void supabase.auth.signOut().finally(()=>{window.location.href="/";});
  const notice=localNotice??inventory.notice??syncNotice;
  const dismissNotice=()=>{if(localNotice)setLocalNotice(null);else if(inventory.notice)inventory.clearNotice();else clearSyncNotice();};
  const saveCustomer=(customer:Customer)=>update((current)=>({...current,customers:(current.customers??[]).some((item)=>item.id===customer.id)?(current.customers??[]).map((item)=>item.id===customer.id?customer:item):[...(current.customers??[]),customer]}));
  const saveOwnerCash=(movement:OwnerCashMovement)=>update((current)=>({...current,ownerCashMovements:(current.ownerCashMovements??[]).some((item)=>item.id===movement.id)?(current.ownerCashMovements??[]).map((item)=>item.id===movement.id?movement:item):[movement,...(current.ownerCashMovements??[])]}));

  return <AppShell view={view} onView={onView} onSale={()=>setSheet({type:"sale"})} onSettings={()=>setSheet({type:"settings"})} onLogout={logout}>
    <StatusToast notice={notice} onDismiss={dismissNotice}/>
    {view==="home"&&<div className="space-y-6"><HomeOperations state={homeState} events={homeCalendar.events} inventory={inventory.snapshot} onSale={()=>setSheet({type:"sale"})} onSupplies={()=>openProducts("supplies")} onProducts={()=>openProducts("products")} onPricing={()=>onView("pricing")} onCalendar={()=>onView("calendar")} onInventory={()=>onView("inventory")}/><HomeView state={homeState} numbers={numbers} onSale={()=>setSheet({type:"sale"})} onPricing={()=>onView("pricing")} onCashMovement={()=>setSheet({type:"ownerCash"})}/></div>}
    {view==="sales"&&<SalesHistoryView state={state} onNew={()=>setSheet({type:"sale"})} onCancel={(saleId,reason)=>update((current)=>({...current,sales:current.sales.map((sale)=>sale.id===saleId?{...sale,status:"cancelled",cancelReason:reason,cancelledAt:new Date().toISOString()}:sale)}))}/>} 
    {view==="customers"&&<CustomersView state={state} onSave={saveCustomer}/>} 
    {view==="calendar"&&<CalendarView/>}
    {view==="inventory"&&<InventoryView state={state} snapshot={inventory.snapshot} loading={inventory.loading} error={inventory.error} onRetry={inventory.reload} onSetBalance={inventory.setBalance} onProduction={inventory.registerProduction}/>} 
    {view==="portfolio"&&<PortfolioHierarchyView state={state} onConfigure={(preset)=>setSheet({type:"product",preset})} onEdit={(value)=>setSheet({type:"product",value})} onAvailability={(product,available)=>setProductAvailability(product.id,available)} onPricing={()=>onView("pricing")}/>} 
    {view==="products"&&<ProductsView state={state} tab={productTab} onTab={setProductTab} onNewSupply={(preset)=>setSheet({type:"supply",preset})} onEditSupply={(value)=>setSheet({type:"supply",value})} onDeleteSupply={(supplyId)=>{const used=state.products.some((product)=>product.recipe.some((item)=>item.supplyId===supplyId));if(used){setLocalNotice({tone:"error",message:"Esse item está em uma receita ativa. Retire-o do produto antes de arquivar."});return;}update((current)=>({...current,supplies:current.supplies.filter((supply)=>supply.id!==supplyId)}));}} onNewProduct={(preset)=>setSheet({type:"product",preset})} onEditProduct={(value)=>setSheet({type:"product",value})} onDuplicateProduct={(product)=>update((current)=>({...current,products:[...current.products,{...product,id:id("product"),name:`${product.name} (cópia)`,portfolioKey:null,available:true}]}))} onDeleteProduct={(productId)=>update((current)=>({...current,products:current.products.filter((product)=>product.id!==productId)}))} onNewExpense={(presetName)=>setSheet({type:"expense",presetName})} onEditExpense={(value)=>setSheet({type:"expense",value})} onDeleteExpense={(expenseId)=>update((current)=>({...current,expenses:current.expenses.filter((expense)=>expense.id!==expenseId)}))}/>} 
    {view==="pricing"&&<PricingView state={state} onProducts={()=>openProducts("products")}/>} 
    {view==="identity"&&<BrandGuideView/>}
    {sheet?.type==="sale"&&<SaleOrderSheet state={saleState} onClose={()=>setSheet(null)} onSave={(sale)=>{update((current)=>({...current,sales:[sale,...current.sales]}));setSheet(null);}}/>}
    {sheet?.type==="supply"&&<SupplySheet value={sheet.value} preset={sheet.preset} recentSupplies={state.supplies} onClose={()=>setSheet(null)} onSave={(supply)=>{update((current)=>({...current,supplies:current.supplies.some((item)=>item.id===supply.id)?current.supplies.map((item)=>item.id===supply.id?supply:item):[...current.supplies,supply]}));setSheet(null);}}/>}
    {sheet?.type==="product"&&<ProductSheet state={state} value={sheet.value} preset={sheet.preset} onClose={()=>setSheet(null)} onSave={(product)=>{update((current)=>({...current,products:current.products.some((item)=>item.id===product.id)?current.products.map((item)=>item.id===product.id?{...product,available:item.available}:item):[...current.products,{...product,available:true}]}));setSheet(null);}}/>}
    {sheet?.type==="expense"&&<ExpenseSheet value={sheet.value} presetName={sheet.presetName} onClose={()=>setSheet(null)} onSave={(expense)=>{update((current)=>({...current,expenses:current.expenses.some((item)=>item.id===expense.id)?current.expenses.map((item)=>item.id===expense.id?expense:item):[expense,...current.expenses]}));setSheet(null);}}/>}
    {sheet?.type==="ownerCash"&&<OwnerCashMovementSheet value={sheet.value} onClose={()=>setSheet(null)} onSave={(movement)=>{saveOwnerCash(movement);setSheet(null);}}/>}
    {sheet?.type==="settings"&&<SettingsSheet value={state.settings} onClose={()=>setSheet(null)} onSave={(settings:Settings)=>{update((current)=>({...current,settings}));setSheet(null);}} onRefresh={refresh}/>} 
  </AppShell>;
}
