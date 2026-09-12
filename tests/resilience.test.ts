import test from "node:test";
import assert from "node:assert/strict";
import { isTransientError,resilientRequest } from "../src/lib/resilient-request.js";
import { addCalendarDays,businessDate,businessDayStartInstant,businessHour,plusCalendarDay } from "../src/lib/business-time.js";

test("classifica apenas falhas transitórias conhecidas para retry",()=>{
  assert.equal(isTransientError(new Error("Failed to fetch")),true);
  assert.equal(isTransientError(new Error("HTTP 503")),true);
  assert.equal(isTransientError(new Error("429 rate limited")),true);
  assert.equal(isTransientError(new Error("CONFLICT: versão alterada")),false);
  assert.equal(isTransientError(new Error("validation failed")),false);
});

test("retry reutiliza request id e encerra após sucesso",async()=>{
  const ids:string[]=[];let calls=0;
  const result=await resilientRequest(async({requestId})=>{ids.push(requestId);calls+=1;if(calls===1)throw new Error("HTTP 503");return"ok";},{attempts:2,baseDelayMs:1,maxDelayMs:1,timeoutMs:200});
  assert.equal(result,"ok");assert.equal(calls,2);assert.equal(ids[0],ids[1]);
});

test("erro não transitório não é repetido",async()=>{
  let calls=0;
  await assert.rejects(()=>resilientRequest(async()=>{calls+=1;throw new Error("validation failed");},{attempts:3,baseDelayMs:1,timeoutMs:100}),/validation failed/);
  assert.equal(calls,1);
});

test("timeout encerra operação pendente",async()=>{
  await assert.rejects(()=>resilientRequest(async()=>new Promise<string>(()=>undefined),{attempts:1,timeoutMs:10}),/timed out/i);
});

test("data do negócio respeita America/Sao_Paulo na virada UTC",()=>{
  const instant=new Date("2026-09-12T02:30:00Z");
  assert.equal(businessDate(instant),"2026-09-11");
  assert.equal(businessHour(instant),23);
});

test("início do dia do negócio é calculado pelo fuso IANA",()=>{
  assert.equal(businessDayStartInstant("2026-09-12"),"2026-09-12T03:00:00.000Z");
  assert.equal(businessDayStartInstant("2018-11-05"),"2018-11-05T02:00:00.000Z");
});

test("janela recente atravessa corretamente virada de mês e ano",()=>{
  assert.equal(addCalendarDays("2027-01-10",-45),"2026-11-26");
  assert.equal(addCalendarDays("2028-03-01",-2),"2028-02-28");
});

test("mesmo instante não depende do fuso configurado no aparelho",()=>{
  const instant=new Date("2026-09-12T13:00:00Z");
  assert.equal(businessDate(instant,"America/Sao_Paulo"),"2026-09-12");
  assert.equal(businessDate(instant,"Asia/Tokyo"),"2026-09-12");
  assert.equal(businessHour(instant,"America/Sao_Paulo"),10);
  assert.equal(businessHour(instant,"Asia/Tokyo"),22);
});

test("agenda de amanhã avança por calendário sem deslocamento de meia-noite",()=>{
  assert.equal(plusCalendarDay("2026-12-31"),"2027-01-01");
  assert.equal(plusCalendarDay("2028-02-28"),"2028-02-29");
});
