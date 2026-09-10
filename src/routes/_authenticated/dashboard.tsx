import { createFileRoute } from "@tanstack/react-router";
import { NatApp } from "@/app/NatApp";
import type { NatView } from "@/components/nat/AppShell";

const views: NatView[]=["home","sales","portfolio","products","pricing","identity"];
export const Route=createFileRoute("/_authenticated/dashboard")({
  ssr:false,
  validateSearch:(search:Record<string,unknown>)=>({ view:views.includes(search.view as NatView)?search.view as NatView:"home" }),
  component:DashboardPage,
});
function DashboardPage(){const {view}=Route.useSearch();const navigate=Route.useNavigate();return <NatApp view={view} onView={(next)=>void navigate({search:{view:next}})}/>;}
