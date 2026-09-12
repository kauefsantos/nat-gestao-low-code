export type ApiErrorCode="VERSION_CONFLICT"|"IDEMPOTENCY_CONFLICT"|"VALIDATION_ERROR"|"FORBIDDEN"|"NETWORK_ERROR"|"INTERNAL_ERROR";

export function classifyApiError(value:unknown):{code:ApiErrorCode;message:string;retryable:boolean}{
  const raw=value instanceof Error?value.message:String((value as {message?:unknown})?.message??value??"");
  if(/identificador .*reutilizado|idempotente/i.test(raw))return{code:"IDEMPOTENCY_CONFLICT",message:"Esta operação já foi enviada com dados diferentes. Recarregue os dados antes de tentar novamente.",retryable:false};
  if(/CONFLICT|alterado em outro aparelho|versão inválida/i.test(raw))return{code:"VERSION_CONFLICT",message:"Esse item mudou em outro aparelho. Recarregamos a versão mais recente; refaça a alteração.",retryable:false};
  if(/Acesso negado|permission denied|FORBIDDEN|42501/i.test(raw))return{code:"FORBIDDEN",message:"Você não tem permissão para concluir esta operação.",retryable:false};
  if(/fetch|network|timeout|Failed to fetch/i.test(raw))return{code:"NETWORK_ERROR",message:"A conexão falhou durante a gravação. A NAT vai conferir o estado salvo antes de permitir uma nova tentativa.",retryable:true};
  if(/inválid|não pode|precisa|Informe|insuficiente|não encontrado|indisponível/i.test(raw))return{code:"VALIDATION_ERROR",message:raw.replace(/^.*?:\s*/,"")||"Revise os dados informados e tente novamente.",retryable:false};
  return{code:"INTERNAL_ERROR",message:"Não foi possível concluir a operação com segurança. Os dados foram recarregados.",retryable:false};
}
