import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

export type AuthMfaState={
  currentLevel:string|null;
  verifiedTotpFactorId:string|null;
  pendingTotpFactorIds:string[];
};

export type TotpEnrollment={
  factorId:string;
  qrCode:string;
  secret:string;
};

function fail(error:{message:string}|null){if(error)throw error;}
function requireData<T>(value:T|null,context:string):T{if(value===null)throw new Error(context);return value;}

export const isAuthConfigured=()=>isSupabaseConfigured();

export async function hasActiveSession(){
  const result=await supabase.auth.getSession();
  fail(result.error);
  return Boolean(result.data.session);
}

export async function signInWithPassword(email:string,password:string){
  const result=await supabase.auth.signInWithPassword({email:email.trim(),password});
  fail(result.error);
}

export async function loadMfaState():Promise<AuthMfaState>{
  const assurance=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  fail(assurance.error);
  const assuranceData=requireData(assurance.data,"Não foi possível verificar o nível de segurança da conta.");
  const factors=await supabase.auth.mfa.listFactors();
  fail(factors.error);
  const factorsData=requireData(factors.data,"Não foi possível carregar os fatores de segurança da conta.");
  const verified=factorsData.totp.find((factor)=>factor.status==="verified");
  return{
    currentLevel:assuranceData.currentLevel,
    verifiedTotpFactorId:verified?.id??null,
    pendingTotpFactorIds:factorsData.totp.filter((factor)=>factor.status!=="verified").map((factor)=>factor.id),
  };
}

export async function removeMfaFactor(factorId:string){
  const result=await supabase.auth.mfa.unenroll({factorId});
  fail(result.error);
}

export async function enrollTotp():Promise<TotpEnrollment>{
  const result=await supabase.auth.mfa.enroll({factorType:"totp",friendlyName:"NAT Gestão"});
  fail(result.error);
  const data=requireData(result.data,"Não foi possível iniciar a proteção em duas etapas.");
  return{factorId:data.id,qrCode:data.totp.qr_code,secret:data.totp.secret??""};
}

export async function verifyTotp(factorId:string,code:string){
  const challenge=await supabase.auth.mfa.challenge({factorId});
  fail(challenge.error);
  const challengeData=requireData(challenge.data,"Não foi possível iniciar a validação do código de segurança.");
  const verification=await supabase.auth.mfa.verify({factorId,challengeId:challengeData.id,code});
  fail(verification.error);
}

export async function signOut(){
  await supabase.auth.signOut();
}

export async function createAuthorizedAccount(email:string,password:string){
  const result=await supabase.auth.signUp({email:email.trim().toLowerCase(),password});
  fail(result.error);
  return{hasSession:Boolean(result.data.session)};
}

export async function sendPasswordRecovery(email:string,redirectTo:string){
  // Preserve account-enumeration protection: the UI always returns the same message.
  await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo});
}

export function onPasswordRecovery(callback:()=>void){
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
    if(event==="PASSWORD_RECOVERY"&&session)callback();
  });
  return()=>subscription.unsubscribe();
}

export async function updatePassword(password:string){
  const result=await supabase.auth.updateUser({password});
  fail(result.error);
}
