// @vitest-environment node
import { expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = path.join(process.cwd(), "public/rideshare-tax-pros");
function page(config = {}) {
  const dom = new JSDOM(readFileSync(path.join(source, "index.html"), "utf8"), { url: "https://rideshare-tax-pros.vercel.app/", runScripts: "outside-only" });
  const window = dom.window;
  window.matchMedia = (() => ({ matches: true })) as never;
  window.fetch = (async () => ({ ok: true, json: async () => config })) as never;
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event("close")); };
  window.eval(readFileSync(path.join(source, "app.js"), "utf8"));
  return dom;
}
it("opens each actual page control and shows honest availability while contact details are pending", () => {
  const dom = page(), document = dom.window.document;
  try {
    const dialog = document.querySelector<HTMLDialogElement>("#information")!;
    for (const button of document.querySelectorAll<HTMLElement>("[data-dialog]")) {
      button.click(); expect(dialog.open).toBe(true);
      expect(document.querySelector("#information-title")?.textContent).toBeTruthy();
      dialog.close();
    }
    document.querySelector<HTMLElement>('[data-dialog="portal"]')!.click();
    expect(document.querySelector("#information-extra")?.textContent).toContain("Client access is opening soon");
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
    document.querySelector<HTMLElement>("[data-menu]")!.click();
    expect(document.querySelector("[data-menu]")?.getAttribute("aria-expanded")).toBe("true");
    let scrolled = false;
    document.querySelector<HTMLElement>("#mobile-services")!.scrollIntoView = () => { scrolled = true; };
    document.querySelector<HTMLElement>('[data-nav="services"]')!.click();
    expect(scrolled).toBe(true); expect(document.querySelector("[data-menu]")?.getAttribute("aria-expanded")).toBe("false");
  } finally { dom.window.close(); }
});
it("connects a configured Shuug workspace and ignores unsafe portal destinations", async () => {
  const dom = page({ workspaceUrl: "https://workspace.example.com/", drakePortalUrl: "javascript:alert(1)" });
  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    dom.window.document.querySelector<HTMLElement>('[data-dialog="portal"]')!.click();
    const links = dom.window.document.querySelectorAll<HTMLAnchorElement>("#information-actions a");
    expect(links).toHaveLength(1); expect(links[0].href).toBe("https://workspace.example.com/");
  } finally { dom.window.close(); }
});
