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
  const factors=await supabase.auth.mfa.listFactors();
  fail(factors.error);
  const verified=factors.data.totp.find((factor)=>factor.status==="verified");
  return{
    currentLevel:assurance.data.currentLevel,
    verifiedTotpFactorId:verified?.id??null,
    pendingTotpFactorIds:factors.data.totp.filter((factor)=>factor.status!=="verified").map((factor)=>factor.id),
  };
}

export async function removeMfaFactor(factorId:string){
  const result=await supabase.auth.mfa.unenroll({factorId});
  fail(result.error);
}

export async function enrollTotp():Promise<TotpEnrollment>{
  const result=await supabase.auth.mfa.enroll({factorType:"totp",friendlyName:"NAT Gestão"});
  fail(result.error);
  return{factorId:result.data.id,qrCode:result.data.totp.qr_code,secret:result.data.totp.secret??""};
}

export async function verifyTotp(factorId:string,code:string){
  const challenge=await supabase.auth.mfa.challenge({factorId});
  fail(challenge.error);
  const verification=await supabase.auth.mfa.verify({factorId,challengeId:challenge.data.id,code});
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
