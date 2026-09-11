import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Brand } from "@/components/nat/AppShell";

export const Route=createFileRoute("/_authenticated")({ ssr:false, component:AuthenticatedLayout });
function AuthenticatedLayout(){
  const auth=useAuth();
  useEffect(()=>{if(!auth.isLoading&&auth.configured&&!auth.isAuthenticated){const redirect=`${window.location.pathname}${window.location.search}`;window.location.replace(`/login?redirect=${encodeURIComponent(redirect)}`);}},[auth.configured,auth.isAuthenticated,auth.isLoading]);
  if(!auth.configured)return <main className="grid min-h-screen place-items-center bg-cream px-4"><div className="max-w-md rounded-3xl border border-nat bg-white p-6 text-center"><Brand/><h1 className="mt-6 font-display text-3xl">Ambiente não configurado</h1><p className="mt-2 text-sm leading-6 text-caramel">As variáveis públicas do Supabase precisam estar configuradas para abrir a área protegida.</p></div></main>;
  if(auth.isLoading||!auth.isAuthenticated)return <main className="grid min-h-screen place-items-center bg-cream"><div className="space-y-4 text-center"><Brand/><p role="status" className="text-sm text-caramel">Verificando acesso...</p></div></main>;
  return <Outlet/>;
}
