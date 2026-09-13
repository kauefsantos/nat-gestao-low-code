import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const email="inventory@example.test";
const password=["NAT","RLS","e2e","2026!"].join("-");
test.describe.configure({retries:0});

function decodeBase32(value:string){const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";const normalized=value.toUpperCase().replace(/=+$/g,"").replace(/\s+/g,"");let bits="";for(const char of normalized){const index=alphabet.indexOf(char);if(index<0)throw new Error("Invalid base32 secret");bits+=index.toString(2).padStart(5,"0");}const bytes:number[]=[];for(let index=0;index+8<=bits.length;index+=8)bytes.push(Number.parseInt(bits.slice(index,index+8),2));return Buffer.from(bytes);}
function totp(secret:string,now=Date.now()){const counter=Math.floor(now/1000/30);const buffer=Buffer.alloc(8);buffer.writeBigUInt64BE(BigInt(counter));const digest=createHmac("sha1",decodeBase32(secret)).update(buffer).digest();const offset=digest[digest.length-1]&0x0f;const code=((digest[offset]&0x7f)<<24)|((digest[offset+1]&0xff)<<16)|((digest[offset+2]&0xff)<<8)|(digest[offset+3]&0xff);return String(code%1_000_000).padStart(6,"0");}
async function login(page:Page){await page.goto("/login",{waitUntil:"domcontentloaded"});await expect(page.getByRole("heading",{name:"Bem-vinda de volta"})).toBeVisible({timeout:30_000});await page.getByLabel("E-mail").fill(email);await page.getByLabel("Senha").fill(password);await page.getByRole("button",{name:"Entrar"}).click();await expect(page.getByRole("heading",{name:"Ative a proteção extra"})).toBeVisible({timeout:30_000});const secret=(await page.locator("p.break-all").textContent())?.trim();expect(secret).toBeTruthy();await page.getByLabel("Código de segurança").fill(totp(secret!));await page.getByRole("button",{name:"Ativar e entrar"}).click();await page.waitForURL(/\/dashboard/,{timeout:30_000});}
function card(page:Page,name:string){return page.locator("article").filter({hasText:name}).first();}
async function defineBalance(page:Page,name:string,quantity:string){const item=card(page,name);await expect(item).toBeVisible({timeout:30_000});await item.getByRole("button",{name:"Definir saldo inicial"}).click();const dialog=page.getByRole("dialog",{name:"Definir saldo inicial"});await dialog.getByLabel("Quanto existe agora?").fill(quantity);await dialog.getByLabel("Avisar como estoque baixo a partir de").fill("0");await dialog.getByRole("button",{name:"Começar a controlar"}).click();await expect(dialog).toBeHidden({timeout:30_000});}
async function produce(page:Page,batches:string){await page.getByRole("button",{name:"Registrar produção"}).click();const dialog=page.getByRole("dialog",{name:"Registrar produção"});await dialog.getByLabel("Produto").selectOption({label:"Produto E2E Venda"});await dialog.getByLabel("Quantos lotes?").fill(batches);const responsePromise=page.waitForResponse((response)=>response.url().includes("/functions/v1/nat-inventory-production")&&response.request().method()==="POST");await dialog.getByRole("button",{name:"Confirmar produção"}).click();const response=await responsePromise;expect(response.status()).toBe(200);const payload=await response.json() as{ok?:boolean;batches?:number;unitsProduced?:number;mode?:string};expect(payload.ok).toBe(true);expect(payload.mode).toBe("production");expect(payload.batches).toBe(Number(batches));expect(payload.unitsProduced).toBe(10*Number(batches));await expect(dialog).toBeHidden({timeout:30_000});await expect(page.getByText("Produção registrada. Os ingredientes da receita foram descontados.")).toBeVisible({timeout:30_000});}

test("Edge Function reduz o ingrediente proporcionalmente aos lotes produzidos",async({page})=>{
  test.setTimeout(180_000);
  await login(page);
  await page.goto("/dashboard?view=inventory",{waitUntil:"domcontentloaded"});
  await expect(page.getByRole("heading",{name:"Estoque"})).toBeVisible({timeout:30_000});

  // O seed usa uma receita de 10 unidades por lote e 100 g do ingrediente, sem perda.
  await defineBalance(page,"ONLY TENANT A","1000");
  await defineBalance(page,"Produto E2E Venda","0");
  await expect(card(page,"ONLY TENANT A").getByText("1.000 g",{exact:true})).toBeVisible();
  await expect(card(page,"Produto E2E Venda").getByText("0 un",{exact:true})).toBeVisible();

  // 1 lote: 1000 g - 100 g = 900 g; produto acabado +10 un.
  await produce(page,"1");
  await expect(card(page,"ONLY TENANT A").getByText("900 g",{exact:true})).toBeVisible({timeout:30_000});
  await expect(card(page,"Produto E2E Venda").getByText("10 un",{exact:true})).toBeVisible({timeout:30_000});

  // +2 lotes: -200 g adicionais e +20 unidades. Saldo final: 700 g e 30 un.
  await produce(page,"2");
  await expect(card(page,"ONLY TENANT A").getByText("700 g",{exact:true})).toBeVisible({timeout:30_000});
  await expect(card(page,"Produto E2E Venda").getByText("30 un",{exact:true})).toBeVisible({timeout:30_000});
  await expect(page.getByText("Usado na produção",{exact:true})).toHaveCount(2);
});
