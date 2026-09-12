import test from "node:test";
import assert from "node:assert/strict";
import { isTransientError } from "../src/lib/resilient-request.js";
import { businessDate,businessHour,plusCalendarDay } from "../src/lib/business-time.js";

test("classifica apenas falhas transitórias conhecidas para retry",()=>{
  assert.equal(isTransientError(new Error("Failed to fetch")),true);
  assert.equal(isTransientError(new Error("HTTP 503")),true);
  assert.equal(isTransientError(new Error("429 rate limited")),true);
  assert.equal(isTransientError(new Error("CONFLICT: versão alterada")),false);
  assert.equal(isTransientError(new Error("validation failed")),false);
});

test("data do negócio respeita America/Sao_Paulo na virada UTC",()=>{
  const instant=new Date("2026-09-12T02:30:00Z");
  assert.equal(businessDate(instant),"2026-09-11");
  assert.equal(businessHour(instant),23);
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
