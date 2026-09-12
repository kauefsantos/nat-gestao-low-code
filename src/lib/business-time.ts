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

function offsetAt(instant:Date,timeZone:string){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(instant);
  const get=(type:string)=>Number(parts.find((part)=>part.type===type)?.value??0);
  const representedAsUtc=Date.UTC(get("year"),get("month")-1,get("day"),get("hour"),get("minute"),get("second"));
  return representedAsUtc-Math.floor(instant.getTime()/1000)*1000;
}

export function businessDayStartInstant(date:string,timeZone=NAT_TIME_ZONE){
  const [year,month,day]=date.split("-").map(Number);
  const desiredUtc=Date.UTC(year,month-1,day,0,0,0);
  let candidate=new Date(desiredUtc-offsetAt(new Date(desiredUtc),timeZone));
  candidate=new Date(desiredUtc-offsetAt(candidate,timeZone));
  return candidate.toISOString();
}

export function plusCalendarDay(date:string){
  const value=new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate()+1);
  return value.toISOString().slice(0,10);
}
