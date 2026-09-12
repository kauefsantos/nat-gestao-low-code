import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root=process.cwd();
const src=join(root,"src");
const violations=[];

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
  if((path.startsWith("src/components/")||path.startsWith("src/app/")||path.startsWith("src/routes/"))&&text.includes("@/integrations/supabase/client")){
    violations.push(`${path}: UI/rota não deve acessar o cliente do Lovable Cloud diretamente; use src/data.`);
  }
  if(readFileSync(file).byteLength>30000){
    violations.push(`${path}: arquivo-fonte passou de 30 KB; divida responsabilidades antes de ampliar.`);
  }
}

const legacy="src/data/nat-operational-repository.ts";
if(existsSync(join(root,legacy)))violations.push(`${legacy}: loader legado duplicado deve permanecer removido.`);

const facade="src/domain/nat.ts";
const facadeText=readFileSync(join(root,facade),"utf8");
if(Buffer.byteLength(facadeText)>1500||/\b(?:function|class)\s+/.test(facadeText)){
  violations.push(`${facade}: deve permanecer uma fachada leve de reexports; coloque regras nos módulos de domínio.`);
}

if(violations.length){
  console.error("Architecture check failed:\n- "+violations.join("\n- "));
  process.exit(1);
}
console.log(`Architecture check OK (${files.length} arquivos TypeScript verificados; sem exceções de UI para Lovable Cloud).`);
