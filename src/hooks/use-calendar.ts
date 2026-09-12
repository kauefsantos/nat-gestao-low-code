import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { CalendarEvent } from "@/domain/calendar";
import { resilientRequest } from "@/lib/resilient-request";

type CalendarRow = Database["public"]["Tables"]["calendar_events"]["Row"];

const toEvent=(row:CalendarRow):CalendarEvent=>({
  id:row.id,eventDate:row.event_date,eventTime:row.event_time,kind:row.kind as CalendarEvent["kind"],title:row.title,details:row.details,
  channel:row.channel,objective:row.objective,status:row.status as CalendarEvent["status"],source:row.source as CalendarEvent["source"],
  updatedAt:row.updated_at??null,reminderEnabled:row.reminder_enabled??true,completedAt:row.completed_at??null,cancelledAt:row.cancelled_at??null,
});

export function useCalendar(enabled=true) {
  const [events,setEvents]=useState<CalendarEvent[]>([]);
  const [loading,setLoading]=useState(enabled);
  const [businessId,setBusinessId]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const loadRevision=useRef(0);

  const load=useCallback(async()=>{
    if(!enabled){setLoading(false);return;}
    const revision=++loadRevision.current;
    try {
      setLoading(true); setError(null);
      const membership=await resilientRequest(async()=>{
        const result=await supabase.from("business_members").select("business_id").order("created_at",{ascending:true}).limit(1).maybeSingle();
        if(result.error)throw result.error;return result;
      },{attempts:3,timeoutMs:10000});
      if(revision!==loadRevision.current)return;
      const id=membership.data?.business_id;
      if(!id) throw new Error("Empresa não encontrada.");
      setBusinessId(id);
      await resilientRequest(async()=>{
        const seed=await supabase.rpc("seed_nat_editorial_calendar",{p_business_id:id});
        if(seed.error)throw seed.error;return seed;
      },{attempts:2,timeoutMs:10000});
      const result=await resilientRequest(async()=>{
        const response=await supabase.from("calendar_events").select("*").eq("business_id",id).order("event_date",{ascending:true}).order("event_time",{ascending:true});
        if(response.error)throw response.error;return response;
      },{attempts:3,timeoutMs:12000});
      if(revision!==loadRevision.current)return;
      setEvents((result.data??[]).map(toEvent));
    } catch (cause) {
      if(revision!==loadRevision.current)return;
      setError(cause instanceof Error?cause.message:"Não foi possível carregar o calendário.");
    } finally { if(revision===loadRevision.current)setLoading(false); }
  },[enabled]);

  useEffect(()=>{if(enabled)void load();else{loadRevision.current+=1;setLoading(false);}return()=>{loadRevision.current+=1;};},[enabled,load]);

  const save=useCallback(async(event:CalendarEvent)=>{
    if(!businessId) throw new Error("Empresa não carregada.");
    const requestId=crypto.randomUUID();
    await resilientRequest(async()=>{
      const result=await supabase.rpc("save_calendar_event_v3" as never,{
        p_business_id:businessId,
        p_request_id:requestId,
        p_id:event.id,
        p_expected_updated_at:event.updatedAt as string,
        p_event_date:event.eventDate,
        p_event_time:event.eventTime as string,
        p_kind:event.kind,
        p_title:event.title,
        p_details:event.details as string,
        p_channel:event.channel as string,
        p_objective:event.objective as string,
        p_status:event.status,
        p_reminder_enabled:event.reminderEnabled,
      } as never);
      if(result.error)throw result.error;return result;
    },{attempts:3,timeoutMs:12000});
    await load();
  },[businessId,load]);

  const cancel=useCallback(async(event:CalendarEvent)=>{
    if(!businessId) throw new Error("Empresa não carregada.");
    await resilientRequest(async()=>{
      const result=await supabase.rpc("cancel_calendar_event_v2",{
        p_business_id:businessId,p_id:event.id,p_expected_updated_at:event.updatedAt as string,
      });
      if(result.error)throw result.error;return result;
    },{attempts:2,timeoutMs:10000});
    await load();
  },[businessId,load]);

  return {events,loading,error,businessId,save,cancel,reload:load};
}
