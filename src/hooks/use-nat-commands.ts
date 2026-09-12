import { useCallback, useRef } from "react";
import { id, type Customer, type NatState, type OwnerCashMovement, type Product } from "@/domain/nat";
import type { PersistContext } from "@/data/nat-repository";
import type { NatWriteSuccess } from "@/hooks/use-nat-store";
import type { AppNotice } from "@/components/nat/Feedback";

type UpdateState=(recipe:(current:NatState)=>NatState,success?:NatWriteSuccess,context?:PersistContext)=>void;

export function useNatCommands({state,update,setLocalNotice}:{state:NatState;update:UpdateState;setLocalNotice:(notice:AppNotice)=>void}){
  const dedupeRef=useRef(new Map<string,number>());

  const acceptOnce=useCallback((key:string)=>{
    const now=Date.now();const previous=dedupeRef.current.get(key)??0;
    if(now-previous<1600)return false;
    dedupeRef.current.set(key,now);
    return true;
  },[]);

  const saveCustomer=useCallback((customer:Customer)=>{
    if(!acceptOnce(`customer:${customer.id}:${customer.updatedAt}`))return;
    update((current)=>({...current,customers:(current.customers??[]).some((item)=>item.id===customer.id)?(current.customers??[]).map((item)=>item.id===customer.id?customer:item):[...(current.customers??[]),customer]}),{message:`Cliente ${customer.name} salvo.`});
  },[acceptOnce,update]);

  const saveOwnerCash=useCallback((movement:OwnerCashMovement)=>{
    if(!acceptOnce(`cash:${movement.id}`))return;
    update((current)=>({...current,ownerCashMovements:(current.ownerCashMovements??[]).some((item)=>item.id===movement.id)?(current.ownerCashMovements??[]).map((item)=>item.id===movement.id?movement:item):[movement,...(current.ownerCashMovements??[])]}),{message:"Movimento de caixa salvo."});
  },[acceptOnce,update]);

  const deleteSupply=useCallback((supplyId:string)=>{
    const supply=state.supplies.find((item)=>item.id===supplyId);if(!supply)return;
    const used=state.products.some((product)=>product.recipe.some((item)=>item.supplyId===supplyId));
    if(used){setLocalNotice({tone:"error",message:"Esse item está em uma receita ativa. Retire-o do produto antes de arquivar."});return;}
    update((current)=>({...current,supplies:current.supplies.filter((item)=>item.id!==supplyId)}),{message:`${supply.name} arquivado.`,actionLabel:"Desfazer",onAction:()=>update((current)=>({...current,supplies:[...current.supplies,supply]}),{message:`${supply.name} restaurado.`})});
  },[setLocalNotice,state.products,state.supplies,update]);

  const deleteProduct=useCallback((productId:string)=>{
    const product=state.products.find((item)=>item.id===productId);if(!product)return;
    update((current)=>({...current,products:current.products.filter((item)=>item.id!==productId)}),{message:`${product.name} arquivado.`,actionLabel:"Desfazer",onAction:()=>update((current)=>({...current,products:[...current.products,product]}),{message:`${product.name} restaurado.`})});
  },[state.products,update]);

  const deleteExpense=useCallback((expenseId:string)=>{
    const expense=state.expenses.find((item)=>item.id===expenseId);if(!expense)return;
    update((current)=>({...current,expenses:current.expenses.filter((item)=>item.id!==expenseId)}),{message:`Gasto “${expense.name}” excluído.`,actionLabel:"Desfazer",onAction:()=>update((current)=>({...current,expenses:[expense,...current.expenses]}),{message:`Gasto “${expense.name}” restaurado.`})});
  },[state.expenses,update]);

  const cancelSale=useCallback((saleId:string,reason:string)=>{
    if(!acceptOnce(`cancel-sale:${saleId}`))return;
    update((current)=>({...current,sales:current.sales.map((sale)=>sale.id===saleId?{...sale,status:"cancelled",cancelReason:reason,cancelledAt:new Date().toISOString()}:sale)}),{message:"Venda ou saída cancelada e mantida no histórico."});
  },[acceptOnce,update]);

  const duplicateProduct=useCallback((product:Product,onCreated:(copy:Product)=>void)=>{
    if(!acceptOnce(`duplicate:${product.id}`))return;
    const copy:Product={...product,id:id("product"),name:`${product.name} (cópia)`,portfolioKey:null,available:true};
    update((current)=>({...current,products:[...current.products,copy]}),{message:`Cópia de ${product.name} criada.`,actionLabel:"Editar cópia",onAction:()=>onCreated(copy)});
  },[acceptOnce,update]);

  return{acceptOnce,saveCustomer,saveOwnerCash,deleteSupply,deleteProduct,deleteExpense,cancelSale,duplicateProduct};
}
