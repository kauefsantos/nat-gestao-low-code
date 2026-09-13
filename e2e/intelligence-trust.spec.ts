import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const email="intelligence@example.test";
const password=["NAT","RLS","e2e","2026!"].join("-");
test.describe.configure({retries:0});

function decodeBase32(value:string){const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";const normalized=value.toUpperCase().replace(/=+$/g,"").replace(/\s+/g,"");let bits="";for(const char of normalized){const index=alphabet.indexOf(char);if(index<0)throw new Error("Invalid base32 secret");bits+=index.toString(2).padStart(5,"0");}const bytes:number[]=[];for(let index=0;index+8<=bits.length;index+=8)bytes.push(Number.parseInt(bits.slice(index,index+8),2));return Buffer.from(bytes);}
function totp(secret:string,now=Date.now()){const counter=Math.floor(now/1000/30);const buffer=Buffer.alloc(8);buffer.writeBigUInt64BE(BigInt(counter));const digest=createHmac("sha1",decodeBase32(secret)).update(buffer).digest();const offset=digest[digest.length-1]&0x0f;const code=((digest[offset]&0x7f)<<24)|((digest[offset+1]&0xff)<<16)|((digest[offset+2]&0xff)<<8)|(digest[offset+3]&0xff);return String(code%1_000_000).padStart(6,"0");}
async function login(page:Page){await page.goto("/login",{waitUntil:"domcontentloaded"});await expect(page.getByRole("heading",{name:"Bem-vinda de volta"})).toBeVisible({timeout:30_000});await page.getByLabel("E-mail").fill(email);await page.getByLabel("Senha").fill(password);await page.getByRole("button",{name:"Entrar"}).click();await expect(page.getByRole("heading",{name:"Ative a proteção extra"})).toBeVisible({timeout:30_000});const secret=(await page.locator("p.break-all").textContent())?.trim();expect(secret).toBeTruthy();await page.getByLabel("Código de segurança").fill(totp(secret!));await page.getByRole("button",{name:"Ativar e entrar"}).click();await page.waitForURL(/\/dashboard/,{timeout:30_000});}

test("base pequena bloqueia recomendações e drill-down concilia fatos reais",async({page})=>{
  test.setTimeout(180_000);await login(page);
  await page.goto("/dashboard?view=intelligence",{waitUntil:"domcontentloaded"});
  await expect(page.getByRole("heading",{name:"O que merece atenção"})).toBeVisible({timeout:30_000});
  await expect(page.getByTestId("bi-small-base")).toBeVisible({timeout:30_000});
  await expect(page.getByTestId("bi-small-base")).toContainText("Padrões ainda bloqueados");
  await expect(page.getByText("Nenhuma recomendação liberada agora.")).toBeVisible();
  await expect(page.getByTestId("business-roi")).toBeVisible();

  await page.getByText("Ver todos os indicadores",{exact:false}).click();
  await expect(page.getByRole("heading",{name:"Inteligência"})).toBeVisible({timeout:30_000});
  await expect(page.getByTestId("bi-patterns-locked")).toBeVisible();
  await expect(page.getByText("Aguardando base",{exact:true}).first()).toBeVisible();
  await expect(page.getByText("Base insuficiente",{exact:true}).first()).toBeVisible();

  const composition=page.getByRole("button",{name:"Ver composição"}).first();
  await expect(composition).toBeVisible();
  await composition.click();
  const dialog=page.getByRole("dialog",{name:/Produto ·/});
  await expect(dialog).toBeVisible({timeout:20_000});
  await expect(dialog.getByText("Composição auditável")).toBeVisible();
  await expect(dialog.getByText("Registros que formam o número")).toBeVisible();
  await expect(dialog.getByText("Pedidos",{exact:true})).toBeVisible();
  await expect(dialog.getByText(/faturamento/i).first()).toBeVisible();
});
