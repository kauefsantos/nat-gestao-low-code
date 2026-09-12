export type RetryPolicy={
  attempts?:number;
  baseDelayMs?:number;
  maxDelayMs?:number;
  timeoutMs?:number;
  retryable?:(error:unknown)=>boolean;
};

const sleep=(ms:number)=>new Promise((resolve)=>globalThis.setTimeout(resolve,ms));

export function isTransientError(error:unknown){
  const message=error instanceof Error?error.message:String(error??"");
  return /fetch|network|timeout|timed out|429|408|425|500|502|503|504|failed to fetch/i.test(message);
}

export async function resilientRequest<T>(operation:(context:{attempt:number;signal:AbortSignal;requestId:string})=>Promise<T>,policy:RetryPolicy={}){
  const attempts=Math.max(1,policy.attempts??2);
  const baseDelayMs=policy.baseDelayMs??250;
  const maxDelayMs=policy.maxDelayMs??2000;
  const timeoutMs=policy.timeoutMs??12000;
  const retryable=policy.retryable??isTransientError;
  const requestId=crypto.randomUUID();
  let lastError:unknown;
  for(let attempt=1;attempt<=attempts;attempt+=1){
    const controller=new AbortController();
    let timeout:ReturnType<typeof setTimeout>|undefined;
    const deadline=new Promise<never>((_,reject)=>{
      timeout=globalThis.setTimeout(()=>{
        const error=new DOMException("Request timed out","TimeoutError");
        controller.abort(error);
        reject(error);
      },timeoutMs);
    });
    try{
      return await Promise.race([operation({attempt,signal:controller.signal,requestId}),deadline]);
    }catch(error){
      lastError=error;
      if(attempt>=attempts||!retryable(error))throw error;
      const exponential=Math.min(maxDelayMs,baseDelayMs*2**(attempt-1));
      const jitter=Math.floor(Math.random()*Math.max(50,Math.round(exponential*0.2)));
      await sleep(exponential+jitter);
    }finally{
      if(timeout!==undefined)globalThis.clearTimeout(timeout);
    }
  }
  throw lastError;
}
