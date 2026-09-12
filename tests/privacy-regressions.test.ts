import assert from "node:assert/strict";
import test from "node:test";
import { buildPrivacySafeBackup } from "../src/lib/export-data.js";
import { pruneDiagnostics, redactDiagnosticText } from "../src/lib/telemetry.js";
import type { NatState } from "../src/domain/nat.js";

test("privacy-safe backup excludes customer identifiers and notes",()=>{
  const state:NatState={version:6,supplies:[],products:[],sales:[],expenses:[],ownerCashMovements:[],settings:{ownerName:"NAT",monthlyFixedCosts:0,paymentFeePercent:0,defaultMinimumMarginPercent:35,defaultTargetMarginPercent:50},customers:[{id:"11111111-1111-4111-8111-111111111111",name:"Pessoa Real",phone:"11999999999",instagram:"@pessoa",source:"Instagram",marketingConsent:true,notes:"observação privada",active:true,createdAt:"2026-01-01T00:00:00Z",updatedAt:"2026-01-01T00:00:00Z"}]};
  const text=JSON.stringify(buildPrivacySafeBackup(state));
  assert.equal(text.includes("Pessoa Real"),false);
  assert.equal(text.includes("11999999999"),false);
  assert.equal(text.includes("@pessoa"),false);
  assert.equal(text.includes("observação privada"),false);
  assert.equal(text.includes("marketingConsent"),false);
});

test("diagnostics redact common personal data and secrets",()=>{
  const redacted=redactDiagnosticText("email teste@example.com fone (11) 99999-9999 CPF 123.456.789-00 Authorization: abc123");
  assert.equal(redacted.includes("teste@example.com"),false);
  assert.equal(redacted.includes("99999-9999"),false);
  assert.equal(redacted.includes("123.456.789-00"),false);
  assert.equal(redacted.includes("abc123"),false);
});

test("diagnostics expire after 14 days",()=>{
  const now=new Date("2026-09-11T12:00:00Z").getTime();
  const events=[
    {at:"2026-08-20T12:00:00Z",kind:"manual" as const,message:"old",path:"/"},
    {at:"2026-09-10T12:00:00Z",kind:"manual" as const,message:"new",path:"/"},
  ];
  assert.deepEqual(pruneDiagnostics(events,now).map((event)=>event.message),["new"]);
});