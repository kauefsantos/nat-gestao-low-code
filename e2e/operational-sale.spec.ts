import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const email="operations@example.test";
const password="NAT-RLS-e2e-2026!";

test.describe.configure({retries:0});

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

async function waitForSaved(page:Page,message:string){
  await expect(page.getByText(message,{exact:true})).toBeVisible({timeout:20_000});
}

test("fluxos operacionais persistem após reload",async({page})=>{
  test.setTimeout(240_000);
  await login(page);

  // Venda e cancelamento
  await page.goto("/dashboard?view=sales");
  await expect(page.getByRole("heading",{name:"Vendas e saídas"})).toBeVisible({timeout:30_000});
  await page.getByRole("button",{name:"Registrar venda ou saída"}).click();
  const saleDialog=page.getByRole("dialog",{name:"Registrar venda ou saída"});
  await expect(saleDialog).toBeVisible();
  await saleDialog.getByLabel("Produto 1",{exact:true}).selectOption({label:"Produto E2E Venda"});
  await saleDialog.getByLabel("Quantidade do produto 1",{exact:true}).fill("2");
  await expect(saleDialog.getByText("Resumo antes de salvar")).toBeVisible({timeout:20_000});
  const saveSale=saleDialog.getByRole("button",{name:"Registrar venda"});
  await expect(saveSale).toBeEnabled({timeout:20_000});
  await saveSale.click();
  await expect(saleDialog).toBeHidden({timeout:30_000});
  await expect(page.getByText(/Venda registrada:/)).toBeVisible({timeout:20_000});
  await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.getByRole("heading",{name:"Vendas e saídas"})).toBeVisible({timeout:30_000});
  await expect(page.getByText("Produto E2E Venda",{exact:true})).toBeVisible({timeout:20_000});

  await page.getByRole("button",{name:"Cancelar Produto E2E Venda"}).click();
  const cancel=page.getByRole("dialog",{name:"Cancelar venda ou saída"});
  await expect(cancel).toBeVisible();
  await cancel.getByLabel("Motivo do cancelamento",{exact:true}).fill("Validação E2E de cancelamento");
  await cancel.getByRole("button",{name:"Cancelar movimento"}).click();
  await expect(cancel).toBeHidden({timeout:30_000});
  await waitForSaved(page,"Venda ou saída cancelada e mantida no histórico.");
  await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.getByText("Cancelada",{exact:true})).toBeVisible({timeout:20_000});
  await expect(page.getByText("Motivo: Validação E2E de cancelamento",{exact:true})).toBeVisible({timeout:20_000});

  // Cliente
  await page.goto("/dashboard?view=customers");
  await expect(page.getByRole("heading",{name:"Clientes",exact:true})).toBeVisible({timeout:30_000});
  await page.getByRole("button",{name:"Novo cliente"}).click();
  const customerDialog=page.getByRole("dialog",{name:"Novo cliente"});
  await expect(customerDialog).toBeVisible();
  await customerDialog.getByLabel("Nome",{exact:true}).fill("Cliente E2E");
  await customerDialog.getByRole("button",{name:"Salvar cliente"}).click();
  await expect(customerDialog).toBeHidden({timeout:30_000});
  await waitForSaved(page,"Cliente Cliente E2E salvo.");
  await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.getByText("Cliente E2E",{exact:true})).toBeVisible({timeout:20_000});

  // Compra / insumo
  await page.goto("/dashboard?view=products");
  await expect(page.getByRole("heading",{name:"Produtos e compras"})).toBeVisible({timeout:30_000});
  await page.getByRole("tab",{name:"Compras e insumos"}).click();
  await page.getByRole("button",{name:"Registrar nova compra"}).click();
  const supplyDialog=page.getByRole("dialog",{name:"Registrar compra"});
  await expect(supplyDialog).toBeVisible();
  await supplyDialog.getByLabel("O que você comprou?",{exact:true}).fill("Insumo E2E");
  await supplyDialog.getByLabel("Quanto veio?",{exact:true}).fill("100");
  await supplyDialog.getByLabel("Unidade",{exact:true}).selectOption("g");
  await supplyDialog.getByLabel("Valor pago em reais",{exact:true}).fill("10,00");
  await supplyDialog.getByRole("button",{name:"Salvar compra"}).click();
  await expect(supplyDialog).toBeHidden({timeout:30_000});
  await waitForSaved(page,"Compra de Insumo E2E salva.");
  await page.reload({waitUntil:"domcontentloaded"});
  await page.getByRole("tab",{name:"Compras e insumos"}).click();
  await expect(page.getByText("Insumo E2E",{exact:true})).toBeVisible({timeout:20_000});

  // Gasto extra
  await page.getByRole("tab",{name:"Gastos extras"}).click();
  await page.getByRole("button",{name:"Registrar novo gasto"}).click();
  const expenseDialog=page.getByRole("dialog",{name:"Registrar gasto extra"});
  await expect(expenseDialog).toBeVisible();
  await expenseDialog.getByLabel("O que foi pago?",{exact:true}).fill("Gasto E2E");
  await expenseDialog.getByLabel("Valor pago",{exact:true}).fill("7,50");
  await expenseDialog.getByRole("button",{name:"Salvar gasto"}).click();
  await expect(expenseDialog).toBeHidden({timeout:30_000});
  await waitForSaved(page,"Gasto “Gasto E2E” salvo.");
  await page.reload({waitUntil:"domcontentloaded"});
  await page.getByRole("tab",{name:"Gastos extras"}).click();
  await expect(page.getByText("Gasto E2E",{exact:true})).toBeVisible({timeout:20_000});

  // Agenda
  await page.goto("/dashboard?view=calendar");
  await expect(page.getByRole("heading",{name:"Agenda",exact:true})).toBeVisible({timeout:30_000});
  await page.getByRole("button",{name:"Novo compromisso"}).click();
  const calendarDialog=page.getByRole("dialog",{name:"Novo compromisso"});
  await expect(calendarDialog).toBeVisible();
  await calendarDialog.getByLabel("Título",{exact:true}).fill("Compromisso E2E");
  await calendarDialog.getByLabel("Receber lembrete",{exact:false}).uncheck();
  await calendarDialog.getByRole("button",{name:"Adicionar à agenda"}).click();
  await expect(calendarDialog).toBeHidden({timeout:30_000});
  await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.getByText("Compromisso E2E",{exact:true})).toBeVisible({timeout:20_000});
});
