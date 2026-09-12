import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root=process.cwd();
const src=join(root,"src");
const violations=[];
const componentIntegrationExceptions=new Set([
  // Authoritative sale quote. Keep isolated until the sale sheet is split into a controller + view.
  "src/components/nat/SaleOrderSheet.tsx",
  // Technical-only diagnostics surface, not a business-data screen.
  "src/components/nat/IntegrationHealthPanel.tsx",
  // External-provider integration surface; AI is currently disabled in product UI.
  "src/components/nat/ContentStudio.tsx",
]);

function walk(dir){
  const result=[];
  for(const name of readdirSync(dir)){
    const full=join(dir,name);const stat=statSync(full);
    if(stat.isDirectory())result.push(...walk(full));
    else if(/\.(ts|tsx)$/.test(name))result.push(full);
  }
  return result;
}

const files=walk(src);
const normalized=(file)=>relative(root,file).replaceAll("\\","/");
const hasImport=(text,pattern)=>pattern.test(text);

for(const file of files){
  const path=normalized(file);const text=readFileSync(file,"utf8");
  if(path==="src/routeTree.gen.ts"||path==="src/integrations/supabase/types.ts")continue;

  if(path.startsWith("src/domain/")&&hasImport(text,/from\s+["']@\/(?:data|hooks|components|app|routes|integrations)\//)){
    violations.push(`${path}: domínio não pode depender de data/hooks/UI/integrations.`);
  }
  if(path.startsWith("src/data/")&&hasImport(text,/from\s+["']@\/(?:hooks|components|app|routes)\//)){
    violations.push(`${path}: camada data não pode depender de hooks ou UI.`);
  }
  if(path.startsWith("src/components/")&&text.includes("@/integrations/supabase/client")&&!componentIntegrationExceptions.has(path)){
    violations.push(`${path}: componente não deve acessar o cliente do Lovable Cloud diretamente; use src/data ou hook dedicado.`);
  }
  if(path.startsWith("src/app/")&&text.includes("@/integrations/supabase/client")){
    const authOnly=path==="src/app/NatApp.tsx"&&text.includes("supabase.auth.signOut")&&!/supabase\.(?:from|rpc|functions)\b/.test(text);
    if(!authOnly)violations.push(`${path}: app não deve acessar dados do Lovable Cloud diretamente.`);
  }
  if(readFileSync(file).byteLength>30000){
    violations.push(`${path}: arquivo-fonte passou de 30 KB; divida responsabilidades antes de ampliar.`);
  }
}

const legacy="src/data/nat-operational-repository.ts";
if(existsSync(join(root,legacy)))violations.push(`${legacy}: loader legado duplicado deve permanecer removido.`);

for(const path of componentIntegrationExceptions){
  if(!existsSync(join(root,path)))violations.push(`${path}: exceção arquitetural obsoleta; remova-a do allowlist junto com o arquivo.`);
}

if(violations.length){
  console.error("Architecture check failed:\n- "+violations.join("\n- "));
  process.exit(1);
}
console.log(`Architecture check OK (${files.length} arquivos TypeScript verificados; ${componentIntegrationExceptions.size} exceções explícitas).`);
