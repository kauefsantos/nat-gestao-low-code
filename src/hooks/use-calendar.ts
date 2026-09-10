import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CalendarEvent, CalendarEventKind, CalendarEventStatus } from "@/domain/calendar";

type CalendarRow = {
  id:string; event_date:string; event_time:string|null; kind:CalendarEventKind; title:string; details:string|null;
  channel:string|null; objective:string|null; status:CalendarEventStatus; source:"manual"|"editorial_seed";
};

const toEvent=(row:CalendarRow):CalendarEvent=>({
  id:row.id,eventDate:row.event_date,eventTime:row.event_time,kind:row.kind,title:row.title,details:row.details,
  channel:row.channel,objective:row.objective,status:row.status,source:row.source,
});

export function useCalendar() {
  const [events,setEvents]=useState<CalendarEvent[]>([]);
  const [loading,setLoading]=useState(true);
  const [businessId,setBusinessId]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);

  const load=useCallback(async()=>{
    try {
      setLoading(true); setError(null);
      const membership=await supabase.from("business_members").select("business_id").order("created_at",{ascending:true}).limit(1).maybeSingle();
      if(membership.error) throw membership.error;
      const id=membership.data?.business_id;
      if(!id) throw new Error("Empresa não encontrada.");
      setBusinessId(id);
      const seed=await supabase.rpc("seed_nat_editorial_calendar" as never,{p_business_id:id} as never);
      if(seed.error) throw seed.error;
      const result=await (supabase.from("calendar_events" as never) as any).select("id,event_date,event_time,kind,title,details,channel,objective,status,source").eq("business_id",id).order("event_date",{ascending:true}).order("event_time",{ascending:true});
      if(result.error) throw result.error;
      setEvents((result.data??[]).map(toEvent));
    } catch (cause) {
      setError(cause instanceof Error?cause.message:"Não foi possível carregar o calendário.");
    } finally { setLoading(false); }
  },[]);

  useEffect(()=>{void load();},[load]);

  const save=useCallback(async(event:CalendarEvent)=>{
    if(!businessId) throw new Error("Empresa não carregada.");
    const result=await supabase.rpc("save_calendar_event" as never,{
      p_business_id:businessId,p_id:event.id,p_event_date:event.eventDate,p_event_time:event.eventTime,
      p_kind:event.kind,p_title:event.title,p_details:event.details,p_channel:event.channel,p_objective:event.objective,p_status:event.status,
    } as never);
    if(result.error) throw result.error;
    await load();
  },[businessId,load]);

  const remove=useCallback(async(id:string)=>{
    if(!businessId) throw new Error("Empresa não carregada.");
    const result=await supabase.rpc("delete_calendar_event" as never,{p_business_id:businessId,p_id:id} as never);
    if(result.error) throw result.error;
    await load();
  },[businessId,load]);

  return {events,loading,error,save,remove,reload:load};
}
