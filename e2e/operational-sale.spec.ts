import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const email="operations@example.test";
const password="NAT-RLS-e2e-2026!";

function decodeBase32(value:string){
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized=value.toUpperCase().replace(/=+$/g,"").replace(/\s+/g,"");
  let bits="";
  for(const char of normalized){const index=alphabet.indexOf(char);if(index<0)throw new Error("Invalid base32 secret");bits+=index.toString(2).padStart(5,"0");}
  const bytes:number[]=[];
  for(let index=0;index+8<=bits.length;index+=8)bytes.push(Number.parseInt(bits.slice(index,index+8),2));
  return Buffer.from(bytes);
}

function totp(secret:string,now=Date.now()){
  const counter=Math.floor(now/1000/30);
  const buffer=Buffer.alloc(8);buffer.writeBigUInt64BE(BigInt(counter));
  const digest=createHmac("sha1",decodeBase32(secret)).update(buffer).digest();
  const offset=digest[digest.length-1]&0x0f;
  const code=((digest[offset]&0x7f)<<24)|((digest[offset+1]&0xff)<<16)|((digest[offset+2]&0xff)<<8)|(digest[offset+3]&0xff);
  return String(code%1_000_000).padStart(6,"0");
}

async function login(page:Page){
  await page.goto("/login",{waitUntil:"domcontentloaded"});
  await expect(page.getByRole("heading",{name:"Bem-vinda de volta"})).toBeVisible({timeout:30_000});
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button",{name:"Entrar"}).click();
  await expect(page.getByRole("heading",{name:"Ative a proteção extra"})).toBeVisible({timeout:30_000});
  const secret=(await page.locator("p.break-all").textContent())?.trim();
  expect(secret).toBeTruthy();
  await page.getByLabel("Código de segurança").fill(totp(secret!));
  await page.getByRole("button",{name:"Ativar e entrar"}).click();
  await page.waitForURL(/\/dashboard/,{timeout:30_000});
  await expect(page.locator("header")).toBeVisible({timeout:30_000});
}

test("venda persiste após reload e cancelamento também persiste",async({page})=>{
  test.setTimeout(120_000);
  await login(page);
  await page.goto("/dashboard?view=sales");
  await expect(page.getByRole("heading",{name:"Vendas e saídas"})).toBeVisible({timeout:30_000});

  await page.getByRole("button",{name:"Registrar venda ou saída"}).click();
  const dialog=page.getByRole("dialog",{name:"Registrar venda ou saída"});
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Produto 1").selectOption({label:"Produto E2E Venda"});
  await dialog.getByLabel("Quantidade do produto 1").fill("2");
  await expect(dialog.getByText("Resumo antes de salvar")).toBeVisible({timeout:20_000});
  const save=dialog.getByRole("button",{name:"Registrar venda"});
  await expect(save).toBeEnabled({timeout:20_000});
  await save.click();
  await expect(dialog).toBeHidden({timeout:30_000});
  await expect(page.getByText(/Venda registrada:/)).toBeVisible({timeout:20_000});

  await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.getByRole("heading",{name:"Vendas e saídas"})).toBeVisible({timeout:30_000});
  await expect(page.getByText("2 × Produto E2E Venda")).toBeVisible({timeout:20_000});

  await page.getByRole("button",{name:"Cancelar Produto E2E Venda"}).click();
  const cancel=page.getByRole("dialog",{name:"Cancelar venda ou saída"});
  await expect(cancel).toBeVisible();
  await cancel.getByLabel("Motivo do cancelamento").fill("Validação E2E de cancelamento");
  await cancel.getByRole("button",{name:"Cancelar movimento"}).click();
  await expect(cancel).toBeHidden({timeout:30_000});

  await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.getByRole("heading",{name:"Vendas e saídas"})).toBeVisible({timeout:30_000});
  await expect(page.getByText("Cancelada")).toBeVisible({timeout:20_000});
  await expect(page.getByText("Motivo: Validação E2E de cancelamento")).toBeVisible({timeout:20_000});
});
