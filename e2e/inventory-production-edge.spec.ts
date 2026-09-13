import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const email=process.env.E2E_EMAIL??"";
const password=process.env.E2E_PASSWORD??"";
test.describe.configure({retries:0});

function decodeBase32(value:string){const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";const normalized=value.toUpperCase().replace(/=+$/g,"").replace(/\s+/g,"");let bits="";for(const char of normalized){const index=alphabet.indexOf(char);if(index<0)throw new Error("Invalid base32 secret");bits+=index.toString(2).padStart(5,"0");}const bytes:number[]=[];for(let index=0;index+8<=bits.length;index+=8)bytes.push(Number.parseInt(bits.slice(index,index+8),2));return Buffer.from(bytes);}
function totp(secret:string,now=Date.now()){const counter=Math.floor(now/1000/30);const buffer=Buffer.alloc(8);buffer.writeBigUInt64BE(BigInt(counter));const digest=createHmac("sha1",decodeBase32(secret)).update(buffer).digest();const offset=digest[digest.length-1]&0x0f;const code=((digest[offset]&0x7f)<<24)|((digest[offset+1]&0xff)<<16)|((digest[offset+2]&0xff)<<8)|(digest[offset+3]&0xff);return String(code%1_000_000).padStart(6,"0");}
async function login(page:Page){expect(email).toBeTruthy();expect(password).toBeTruthy();await page.goto("/login",{waitUntil:"domcontentloaded"});await expect(page.getByRole("heading",{name:"Bem-vinda de volta"})).toBeVisible({timeout:30_000});await page.getByLabel("E-mail").fill(email);await page.getByLabel("Senha").fill(password);await page.getByRole("button",{name:"Entrar"}).click();await expect(page.getByRole("heading",{name:"Ative a proteção extra"})).toBeVisible({timeout:30_000});const secret=(await page.locator("p.break-all").textContent())?.trim();expect(secret).toBeTruthy();await page.getByLabel("Código de segurança").fill(totp(secret!));await page.getByRole("button",{name:"Ativar e entrar"}).click();await page.waitForURL(/\/dashboard/,{timeout:30_000});}
function card(page:Page,name:string){return page.locator("article").filter({hasText:name}).first();}
async function defineBalance(page:Page,name:string,quantity:string){const item=card(page,name);await expect(item).toBeVisible({timeout:30_000});await item.getByRole("button",{name:"Definir saldo inicial"}).click();const dialog=page.getByRole("dialog",{name:"Definir saldo inicial"});await dialog.getByLabel("Quanto existe agora?").fill(quantity);await dialog.getByLabel("Avisar como estoque baixo a partir de").fill("0");await dialog.getByRole("button",{name:"Começar a controlar"}).click();await expect(dialog).toBeHidden({timeout:30_000});}
async function produce(page:Page,batches:number){await page.getByRole("button",{name:"Registrar produção"}).click();const dialog=page.getByRole("dialog",{name:"Registrar produção"});await dialog.getByLabel("Produto").selectOption({label:"Produto Edge E2E"});await dialog.getByLabel("Quantos lotes?").fill(String(batches));const edgeResponse=page.waitForResponse((response)=>response.url().includes("/functions/v1/nat-inventory-production")&&response.request().method()==="POST");await dialog.getByRole("button",{name:"Confirmar produção"}).click();const response=await edgeResponse;expect(response.status()).toBe(200);const payload=await response.json() as{ok?:boolean;mode?:string;batches?:number;unitsProduced?:number};expect(payload).toMatchObject({ok:true,mode:"production",batches,unitsProduced:10*batches});await expect(dialog).toBeHidden({timeout:30_000});await expect(page.getByText("Produção registrada. Os ingredientes da receita foram descontados.")).toBeVisible({timeout:30_000});}

test("Edge Function baixa o ingrediente proporcionalmente aos lotes",async({page})=>{
  test.setTimeout(180_000);
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
});
