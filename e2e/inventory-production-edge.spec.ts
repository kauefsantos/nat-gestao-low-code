import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const email=process.env.E2E_EMAIL??"";
const password=process.env.E2E_PASSWORD??"";
const apiUrl=process.env.VITE_SUPABASE_URL??"";
const publicKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY??"";
const businessId="b1000000-0000-4000-8000-000000000001";
const productId="b5000000-0000-4000-8000-000000000001";
test.describe.configure({retries:0});

function decodeBase32(value:string){const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";const normalized=value.toUpperCase().replace(/=+$/g,"").replace(/\s+/g,"");let bits="";for(const char of normalized){const index=alphabet.indexOf(char);if(index<0)throw new Error("Invalid base32 secret");bits+=index.toString(2).padStart(5,"0");}const bytes:number[]=[];for(let index=0;index+8<=bits.length;index+=8)bytes.push(Number.parseInt(bits.slice(index,index+8),2));return Buffer.from(bytes);}
function totp(secret:string,now=Date.now()){const counter=Math.floor(now/1000/30);const buffer=Buffer.alloc(8);buffer.writeBigUInt64BE(BigInt(counter));const digest=createHmac("sha1",decodeBase32(secret)).update(buffer).digest();const offset=digest[digest.length-1]&0x0f;const code=((digest[offset]&0x7f)<<24)|((digest[offset+1]&0xff)<<16)|((digest[offset+2]&0xff)<<8)|(digest[offset+3]&0xff);return String(code%1_000_000).padStart(6,"0");}
async function login(page:Page){
  expect(email).toBeTruthy();expect(password).toBeTruthy();
  await page.goto("/login",{waitUntil:"domcontentloaded"});
  await expect(page.getByRole("heading",{name:"Bem-vinda de volta"})).toBeVisible({timeout:30_000});
  await page.getByLabel("E-mail").fill(email);await page.getByLabel("Senha").fill(password);await page.getByRole("button",{name:"Entrar"}).click();
  await expect(page.getByRole("heading",{name:"Ative a proteção extra"})).toBeVisible({timeout:30_000});
  const secret=(await page.locator("p.break-all").textContent())?.trim();expect(secret).toBeTruthy();
  await page.getByLabel("Código de segurança").fill(totp(secret!));await page.getByRole("button",{name:"Ativar e entrar"}).click();
  await page.waitForURL(/\/dashboard/,{timeout:30_000});
  const detectDashboardState=async()=>{
    if(await page.locator("header").isVisible().catch(()=>false))return "ready";
    if(/\/login/.test(page.url()))return `auth-bounce:${page.url()}`;
    const dataError=page.getByRole("heading",{name:"Não conseguimos abrir seus dados"});
    if(await dataError.isVisible().catch(()=>false)){
      const text=await page.locator("main,body").innerText().catch(()=>"");
      return `data-error:${text.slice(0,600)}`;
    }
    if(await page.getByText("Carregando seus dados...").isVisible().catch(()=>false))return "loading-data";
    if(await page.getByText("Verificando acesso...").isVisible().catch(()=>false))return "verifying-access";
    return `pending:${page.url()}`;
  };
  await expect.poll(detectDashboardState,{timeout:30_000,message:"O dashboard do E2E de estoque não ficou pronto após o MFA."}).toBe("ready");
}
function card(page:Page,name:string){return page.locator("article").filter({hasText:name}).first();}
async function defineBalance(page:Page,name:string,quantity:string){const item=card(page,name);await expect(item).toBeVisible({timeout:30_000});await item.getByRole("button",{name:"Definir saldo inicial"}).click();const dialog=page.getByRole("dialog",{name:"Definir saldo inicial"});await dialog.getByLabel("Quanto existe agora?").fill(quantity);await dialog.getByLabel("Avisar como estoque baixo a partir de").fill("0");await dialog.getByRole("button",{name:"Começar a controlar"}).click();await expect(dialog).toBeHidden({timeout:30_000});}
async function produce(page:Page,batches:number){await page.getByRole("button",{name:"Registrar produção"}).click();const dialog=page.getByRole("dialog",{name:"Registrar produção"});await dialog.getByLabel("Produto").selectOption({label:"Produto Edge E2E"});await dialog.getByLabel("Quantos lotes?").fill(String(batches));const edgeResponse=page.waitForResponse((response)=>response.url().includes("/functions/v1/nat-inventory-production")&&response.request().method()==="POST");await dialog.getByRole("button",{name:"Confirmar produção"}).click();const response=await edgeResponse;expect(response.status()).toBe(200);const payload=await response.json() as{ok?:boolean;mode?:string;batches?:number;unitsProduced?:number};expect(payload).toMatchObject({ok:true,mode:"production",batches,unitsProduced:10*batches});await expect(dialog).toBeHidden({timeout:30_000});await expect(page.getByText("Produção registrada. Os ingredientes da receita foram descontados.")).toBeVisible({timeout:30_000});}
async function accessToken(page:Page){const token=await page.evaluate(()=>{for(let index=0;index<localStorage.length;index+=1){const key=localStorage.key(index);if(!key)continue;const raw=localStorage.getItem(key);if(!raw)continue;try{const value=JSON.parse(raw) as Record<string,unknown>;if(typeof value.access_token==="string")return value.access_token;const session=value.currentSession;if(session&&typeof session==="object"&&!Array.isArray(session)&&typeof (session as Record<string,unknown>).access_token==="string")return String((session as Record<string,unknown>).access_token);}catch{continue;}}return"";});expect(token).toBeTruthy();return token;}
type TargetPayload={ok?:boolean;mode?:string;action?:string;unitsProduced?:number;targetQuantity?:number;previousQuantity?:number;requestId?:string};
async function setProductTarget(request:APIRequestContext,token:string,targetQuantity:number,requestId=randomUUID()){expect(apiUrl).toBeTruthy();expect(publicKey).toBeTruthy();const response=await request.post(`${apiUrl}/functions/v1/nat-inventory-production`,{headers:{Authorization:`Bearer ${token}`,apikey:publicKey},data:{mode:"set_product_stock",businessId,productId,targetQuantity,minimumQuantity:0,requestId}});const payload=await response.json() as TargetPayload;return{status:response.status(),payload,requestId};}

test("Edge Function baixa ingrediente por lote e serializa metas concorrentes de produto",async({page,request})=>{
  test.setTimeout(240_000);
  await login(page);
  await page.goto("/dashboard?view=inventory",{waitUntil:"domcontentloaded"});
  await expect(page.getByRole("heading",{name:"Estoque"})).toBeVisible({timeout:30_000});

  await defineBalance(page,"Ingrediente Edge E2E","1000");
  await defineBalance(page,"Produto Edge E2E","0");
  await expect(card(page,"Ingrediente Edge E2E").getByText("1.000 g",{exact:true})).toBeVisible();
  await expect(card(page,"Produto Edge E2E").getByText("0 un",{exact:true})).toBeVisible();

  await produce(page,1);
  await expect(card(page,"Ingrediente Edge E2E").getByText("900 g",{exact:true})).toBeVisible({timeout:30_000});
  await expect(card(page,"Produto Edge E2E").getByText("10 un",{exact:true})).toBeVisible({timeout:30_000});

  await produce(page,2);
  await expect(card(page,"Ingrediente Edge E2E").getByText("700 g",{exact:true})).toBeVisible({timeout:30_000});
  await expect(card(page,"Produto Edge E2E").getByText("30 un",{exact:true})).toBeVisible({timeout:30_000});
  await expect(page.getByText(/Usado na produção ·/)).toHaveCount(2);

  const token=await accessToken(page);
  const [first,second]=await Promise.all([
    setProductTarget(request,token,40),
    setProductTarget(request,token,40),
  ]);
  expect(first.status).toBe(200);expect(second.status).toBe(200);
  expect(first.payload.ok).toBe(true);expect(second.payload.ok).toBe(true);
  expect(first.payload.mode).toBe("set_product_stock");expect(second.payload.mode).toBe("set_product_stock");
  expect((first.payload.unitsProduced??0)+(second.payload.unitsProduced??0)).toBe(10);
  expect([first.payload.action,second.payload.action].sort()).toEqual(["minimum_only","production"]);

  await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.getByRole("heading",{name:"Estoque"})).toBeVisible({timeout:30_000});
  await expect(card(page,"Ingrediente Edge E2E").getByText("600 g",{exact:true})).toBeVisible({timeout:30_000});
  await expect(card(page,"Produto Edge E2E").getByText("40 un",{exact:true})).toBeVisible({timeout:30_000});

  const retryId=randomUUID();
  const original=await setProductTarget(request,token,50,retryId);
  const retry=await setProductTarget(request,token,50,retryId);
  expect(original.status).toBe(200);expect(retry.status).toBe(200);
  expect(original.payload).toEqual(retry.payload);
  await page.reload({waitUntil:"domcontentloaded"});
  await expect(card(page,"Ingrediente Edge E2E").getByText("500 g",{exact:true})).toBeVisible({timeout:30_000});
  await expect(card(page,"Produto Edge E2E").getByText("50 un",{exact:true})).toBeVisible({timeout:30_000});
});
