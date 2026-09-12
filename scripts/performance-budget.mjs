import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const dir="dist/client/assets";
const files=readdirSync(dir).filter((name)=>name.endsWith(".js")||name.endsWith(".css"));
const metrics=files.map((name)=>{const raw=readFileSync(join(dir,name));return{name,raw:raw.length,gzip:gzipSync(raw).length,type:name.endsWith(".css")?"css":"js"};});
const js=metrics.filter((item)=>item.type==="js");const css=metrics.filter((item)=>item.type==="css");
const largestJs=js.reduce((best,item)=>item.gzip>best.gzip?item:best,{name:"",raw:0,gzip:0,type:"js"});
const totalJsGzip=js.reduce((sum,item)=>sum+item.gzip,0);const totalCssGzip=css.reduce((sum,item)=>sum+item.gzip,0);
const limits={largestJsGzip:120*1024,totalJsGzip:280*1024,totalCssGzip:12*1024,largestRawJs:360*1024};
const failures=[];
if(largestJs.gzip>limits.largestJsGzip)failures.push(`Maior JS gzip ${largestJs.name}: ${(largestJs.gzip/1024).toFixed(1)} kB > 120 kB`);
if(largestJs.raw>limits.largestRawJs)failures.push(`Maior JS bruto ${largestJs.name}: ${(largestJs.raw/1024).toFixed(1)} kB > 360 kB`);
if(totalJsGzip>limits.totalJsGzip)failures.push(`JS gzip total: ${(totalJsGzip/1024).toFixed(1)} kB > 280 kB`);
if(totalCssGzip>limits.totalCssGzip)failures.push(`CSS gzip total: ${(totalCssGzip/1024).toFixed(1)} kB > 12 kB`);
console.log(`Performance budget: maior JS ${largestJs.name} ${(largestJs.gzip/1024).toFixed(1)} kB gzip; JS total ${(totalJsGzip/1024).toFixed(1)} kB gzip; CSS ${(totalCssGzip/1024).toFixed(1)} kB gzip.`);
if(failures.length){console.error(failures.join("\n"));process.exit(1);}console.log("Performance budget passed.");
