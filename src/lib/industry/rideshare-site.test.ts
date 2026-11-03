// @vitest-environment node
import { expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
const source = path.join(process.cwd(), "deployments/rideshare-tax-pros/.vercel/output/static");
function page(slug = "", config = {}, hash = "") {
  const dom = new JSDOM(readFileSync(path.join(source, slug ? `${slug}.html` : "index.html"), "utf8"), { url: `https://rideshare-tax-pros.vercel.app/${slug}${hash}`, runScripts: "outside-only" });
  const w = dom.window;
  w.matchMedia = (() => ({ matches: true })) as never;
  w.fetch = (async () => ({ ok: true, json: async () => config })) as never;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event("close")); };
  w.eval(readFileSync(path.join(source,"links.js"),"utf8")); w.eval(readFileSync(path.join(source,"app.js"),"utf8")); w.eval(readFileSync(path.join(source,"inner-pages.js"),"utf8"));
  return dom;
}
it("connects the entire built site with valid internal links, unique page headings and no password intake", () => {
  const manifest = JSON.parse(readFileSync(path.join(source,"site-manifest.json"),"utf8"));
  expect(manifest.aliases).toHaveLength(18);
  for (const slug of ["", ...manifest.aliases]) {
    const dom = page(slug); const d = dom.window.document;
    try {
      expect(d.querySelector('meta[name="viewport"]')).not.toBeNull();
      if(slug) expect(d.querySelectorAll("h1")).toHaveLength(1);
      expect(d.querySelector('input[type="password"]')).toBeNull();
      for (const a of d.querySelectorAll<HTMLAnchorElement>('a[href]')) {
        const url = new URL(a.href);
        if(url.origin !== 'https://rideshare-tax-pros.vercel.app') continue;
        if(url.pathname === `/${slug}` && url.hash) expect(d.getElementById(url.hash.slice(1)),`${slug}:${a.href}`).not.toBeNull();
        else if(url.pathname !== '/') expect(manifest.aliases.includes(url.pathname.slice(1)) || existsSync(path.join(source,url.pathname.slice(1))),a.href).toBe(true);
      }
      expect(d.querySelectorAll('.mobile-action-bar a')).toHaveLength(2);
    } finally { dom.window.close(); }
  }
});
it("takes a service choice into a filtered checklist and updates actual print/export progress", async () => {
  const start = page('get-started'); const d = start.window.document;
  d.querySelector<HTMLElement>('[data-plan]')!.click(); expect(d.querySelector<HTMLElement>('#planner-error')!.hidden).toBe(false);
  d.querySelector<HTMLSelectElement>('#plan-year')!.value = '2025';
  d.querySelector<HTMLInputElement>('input[value="quarterly"]')!.checked=true; d.querySelector<HTMLInputElement>('input[value="uber"]')!.checked=true;
  d.querySelector<HTMLElement>('[data-plan]')!.click();
  const href = new URL(d.querySelector<HTMLAnchorElement>('#plan-checklist')!.href); expect(href.hash).toContain('year=2025');
  const checklist = page('document-checklist',{},href.hash); start.window.close();
  try {
    const doc=checklist.window.document;
    expect(doc.querySelector<HTMLElement>('.record-item[data-platform="lyft"]')!.hidden).toBe(true);
    const input=doc.querySelector<HTMLInputElement>('[data-record-item]')!; input.click();
    expect(doc.querySelector('#checklist-count')!.textContent).toContain('1 of 13');
    const print=vi.fn(); checklist.window.print=print; doc.querySelector<HTMLElement>('[data-print]')!.click(); expect(print).toHaveBeenCalledOnce();
    let exported: Blob | undefined;
    checklist.window.Blob=Blob as never;
    checklist.window.URL.createObjectURL=((blob: Blob)=>{exported=blob;return 'blob:local-test';}) as never;
    checklist.window.URL.revokeObjectURL=vi.fn();
    checklist.window.HTMLAnchorElement.prototype.click=function(){};
    doc.querySelector<HTMLElement>('[data-download]')!.click();
    expect(await exported!.text()).toContain('[Ready] Uber'); expect(await exported!.text()).not.toContain('Lyft annual');
    doc.querySelector<HTMLElement>('[data-reset]')!.click(); expect(doc.querySelector('#checklist-count')!.textContent).toContain('0 of 13');
    expect(checklist.window.localStorage.length).toBe(0);
  } finally { checklist.window.close(); }
});
it("combines FAQ text search with topics and handles no matches", () => {
  const dom=page('faq');const d=dom.window.document;
  try {
    const search=d.querySelector<HTMLInputElement>('[data-search-input]')!; search.value='1099';search.dispatchEvent(new dom.window.Event('input'));
    expect(d.querySelector('[data-search-count]')!.textContent).toContain('1 question found');
    const category=d.querySelector<HTMLSelectElement>('[data-search-category]')!;category.value='Client access';category.dispatchEvent(new dom.window.Event('change'));
    expect(d.querySelector<HTMLElement>('[data-search-empty]')!.hidden).toBe(false);
    const clear=d.querySelector<HTMLButtonElement>('[data-clear-search]')!; expect(clear.disabled).toBe(false); clear.click();
    expect(search.value).toBe(''); expect(category.value).toBe('all');
    expect(d.querySelector('[data-search-count]')!.textContent).toContain('20 questions found');
    expect(d.activeElement).toBe(search);
  } finally {dom.window.close();}
});
it("offers a configured workspace without accepting unsafe external destinations", async () => {
  const dom=page('client-portal',{workspaceUrl:'https://workspace.example.com/',drakePortalUrl:'javascript:alert(1)'});
  try {await new Promise(resolve=>setTimeout(resolve,0));const links=dom.window.document.querySelectorAll<HTMLAnchorElement>('#client-access-links a');expect(links).toHaveLength(1);expect(links[0].href).toBe('https://workspace.example.com/');}finally{dom.window.close();}
});
it("keeps local machines, private addresses and embedded credentials out of public portal links", async () => {
  for (const workspaceUrl of ['https://localhost:3126', 'https://127.0.0.1:3126', 'https://[::1]:3126', 'https://192.168.1.5', 'https://shuug.local', 'https://shuug.internal', 'https://owner:secret@workspace.example.com', 'http://workspace.example.com']) {
    const dom=page('client-portal',{workspaceUrl,drakePortalUrl:workspaceUrl});
    try { await new Promise(resolve=>setTimeout(resolve,0)); expect(dom.window.document.querySelectorAll('#client-access-links a'),workspaceUrl).toHaveLength(0); }
    finally { dom.window.close(); }
  }
});
it("returns keyboard focus to the navigation opener and exposes a focusable main target", () => {
  const dom=page('services');const d=dom.window.document;
  try {
    const opener=d.querySelector<HTMLButtonElement>('[data-menu]')!;opener.focus();opener.click();
    const dialog=d.querySelector<HTMLDialogElement>('#navigation')!;
    expect(dialog.open).toBe(true);expect(opener.getAttribute('aria-expanded')).toBe('true');
    dialog.querySelector<HTMLButtonElement>('[data-close]')!.click();
    expect(dialog.open).toBe(false);expect(opener.getAttribute('aria-expanded')).toBe('false');expect(d.activeElement).toBe(opener);
    expect(d.querySelector('#main')!.getAttribute('tabindex')).toBe('-1');
  } finally {dom.window.close();}
});
