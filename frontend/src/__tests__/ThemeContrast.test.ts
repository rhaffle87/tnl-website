import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const css = readFileSync("src/index.css", "utf8");
const lum=(h:string)=>{const rgb=h.slice(1).match(/../g)!.map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4); return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
describe("Semantic interactive text palette",()=>{
 it.each([[":root","#F1F3EE"],[".dark","#131A16"]])("provides legible link text on %s surfaces",(scope,bg)=>{
  const block=css.slice(css.indexOf(`${scope} {`)).split("\n}")[0];
  const token=block.match(/--tnl-link:\s*(#[0-9a-f]{6})/i)?.[1];
  expect(token,"interactive text must not reuse dark button fill").toBeDefined();
  const ratio=(Math.max(lum(token!),lum(bg))+.05)/(Math.min(lum(token!),lum(bg))+.05);
  expect(ratio).toBeGreaterThanOrEqual(4.5);
 });
 it("keeps outline hover text independent from background fill",()=>{
  expect(css).toMatch(/\.tnl-btn-outline:hover[^}]*color:\s*var\(--tnl-link\)/);
 });
});
