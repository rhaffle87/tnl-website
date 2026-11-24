import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const css = readFileSync("src/index.css", "utf8");
const lum=(h:string)=>{const rgb=h.slice(1).match(/../g)!.map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4); return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
describe("Semantic interactive text palette",()=>{
 it.each([[":root","#F1F3EE"],[".dark","#101312"]])("provides legible link text on %s surfaces",(scope,bg)=>{
  const block=css.slice(css.indexOf(`${scope} {`)).split("\n}")[0];
  const token=block.match(/--tnl-link:\s*(?:var\([^,]+,\s*)?(#[0-9a-f]{6})/i)?.[1];
  expect(token,"interactive text must not reuse dark button fill").toBeDefined();
  const ratio=(Math.max(lum(token!),lum(bg))+.05)/(Math.min(lum(token!),lum(bg))+.05);
  expect(ratio).toBeGreaterThanOrEqual(4.5);
 });
 it("keeps inverse hero headings readable inside editorial CMS pages",()=>{
  const hero=readFileSync("src/components/site/signal-editorial.css","utf8");
  expect(hero).toMatch(/\.signal-hero h1,\s*\.editorial-content \.signal-hero h1\s*\{\s*color:\s*#F1F3EE/i);
 });
 it("pairs configurable contact control backgrounds with semantic foregrounds",()=>{
  const content=readFileSync("src/pages/editorial-content.css","utf8");
  for(const selector of ['[aria-pressed="true"]','[data-testid="map-get-directions"]']){
   const rule=content.slice(content.indexOf(selector)).split("}")[0];
   expect(rule).toContain("background: var(--primary)");
   expect(rule).toContain("color: var(--primary-foreground)");
  }
 });
 it("keeps outline hover text independent from background fill",()=>{
  expect(css).toMatch(/\.tnl-btn-outline:hover[^}]*color:\s*var\(--tnl-link\)/);
 });
 it("isolates dynamic light surfaces so dark mode retains high-contrast obsidian and elevated surfaces",()=>{
  const rootBlock=css.slice(css.indexOf(":root {")).split("\n}")[0];
  const darkBlock=css.slice(css.indexOf(".dark {")).split("\n}")[0];
  expect(rootBlock).toContain("--tnl-surface: var(--tnl-surface-light");
  expect(rootBlock).toContain("--tnl-body: var(--tnl-body-light");
  expect(darkBlock).toContain("--tnl-surface: var(--gsm-bg-surface)");
  expect(darkBlock).toContain("--tnl-body: var(--gsm-text-secondary)");
  expect(darkBlock).toContain("--tnl-tan-text: var(--gsm-accent");
 });
});
