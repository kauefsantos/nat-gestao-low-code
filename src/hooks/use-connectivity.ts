import { useEffect,useState } from "react";

export type ConnectivityState="online"|"offline"|"reconnecting";

export function useConnectivity(){
  const [state,setState]=useState<ConnectivityState>(()=>navigator.onLine?"online":"offline");
  useEffect(()=>{
    let timer:number|undefined;
    const online=()=>{
      setState("reconnecting");
      window.clearTimeout(timer);
      timer=window.setTimeout(()=>setState("online"),1200);
    };
    const offline=()=>{window.clearTimeout(timer);setState("offline");};
    window.addEventListener("online",online);
    window.addEventListener("offline",offline);
    return()=>{window.clearTimeout(timer);window.removeEventListener("online",online);window.removeEventListener("offline",offline);};
  },[]);
  return state;
}
