import type { NatState } from "./nat.js";

const DIAGNOSTIC_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const DIAGNOSTIC_LIMIT = 30;

const REDACTIONS: Array<[RegExp,string]> = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[email removido]"],
  [/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/g,"[telefone removido]"],
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g,"[cpf removido]"],
  [/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{14}\b/g,"[cnpj removido]"],
  [/(bearer\s+)[a-z0-9._-]+/gi,"$1[token removido]"],
  [/(api[_-]?key|secret|token|authorization)(\s*[:=]\s*)[^\s,;]+/gi,"$1$2[segredo removido]"],
];

export function redactSensitiveText(value:string){
  return REDACTIONS.reduce((text,[pattern,replacement])=>text.replace(pattern,replacement),value);
}

export function pruneTimedRecords<T extends {at:string}>(records:T[],now=Date.now(),ttlMs=DIAGNOSTIC_TTL_MS,limit=DIAGNOSTIC_LIMIT){
  return records.filter((record)=>{
    const at=new Date(record.at).getTime();
    return Number.isFinite(at)&&now-at<=ttlMs;
  }).slice(-limit);
}

export function buildPrivacySafeBackup(state:NatState){
  const customers=(state.customers??[]).map((customer)=>({
    id:customer.id,
    pseudonym:`cliente-${customer.id.slice(0,8)}`,
    active:customer.active,
    createdAt:customer.createdAt,
    updatedAt:customer.updatedAt,
  }));
  return {
    exportedAt:new Date().toISOString(),
    format:"nat-gestao-backup-v2-privacy-safe",
    privacyNotice:"Dados identificáveis de clientes, observações e consentimento de marketing não são exportados.",
    state:{...state,customers},
  };
}