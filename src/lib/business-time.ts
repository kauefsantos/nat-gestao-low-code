export const NAT_TIME_ZONE="America/Sao_Paulo";

export function businessDate(now=new Date(),timeZone=NAT_TIME_ZONE){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const get=(type:string)=>parts.find((part)=>part.type===type)?.value??"";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function businessHour(now=new Date(),timeZone=NAT_TIME_ZONE){
  const value=new Intl.DateTimeFormat("en-US",{timeZone,hour:"2-digit",hourCycle:"h23"}).format(now);
  return Number(value);
}

export function plusCalendarDay(date:string){
  const value=new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate()+1);
  return value.toISOString().slice(0,10);
}
