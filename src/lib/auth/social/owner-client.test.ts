// @vitest-environment node
import { createHash, webcrypto } from "node:crypto";
import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { ownerClientScript } from "./owner-client";

const opened: JSDOM[] = [];
afterEach(() => { for (const dom of opened.splice(0)) dom.window.close(); });

function page(provider: "google" | "apple", authorizationUrl: string, popupAllowed = true) {
  const dom = new JSDOM(`<button data-social-provider="${provider}" data-social-purpose="link">Connect ${provider === "google" ? "Google" : "Apple"}</button><button data-social-provider="${provider === "google" ? "apple" : "google"}" data-social-purpose="link">Other provider</button><p id="social-status"></p><div id="social-factor"></div>`, { url: "https://workspace.example.test/api/auth/social/manage", runScripts: "outside-only" });
  opened.push(dom);
  const { window } = dom, document = window.document;
  const popup = { opener: {} as unknown, closed: false, location: { replace: vi.fn() }, close: vi.fn(() => { popup.closed = true; }) };
  window.open = vi.fn(() => popupAllowed ? popup : null) as never;
  Object.defineProperty(window, "crypto", { value: webcrypto });
  window.TextEncoder = TextEncoder;
  const timers: (() => void)[] = [], results: Record<string, unknown>[] = [];
  window.setTimeout = ((callback: () => void) => { timers.push(callback); return timers.length; }) as never;
  const requests: { path: string; body: Record<string, string> }[] = [];
  window.fetch = vi.fn(async (path: string, init: RequestInit) => {
    requests.push({ path, body: JSON.parse(init.body as string) });
    if (path.endsWith("/start")) return new Response(JSON.stringify({ requestId: "synthetic-flow", authorizationUrl, expiresAt: new Date(Date.now() + 600000).toISOString() }));
    if (path.endsWith("/result")) return new Response(JSON.stringify(results.shift() ?? { pending: true }));
    if (path.endsWith("/unlink")) return new Response(JSON.stringify({ error: "Synthetic unlink failure" }), { status: 401 });
    throw new Error("Unexpected request");
  }) as never;
  window.eval(ownerClientScript);
  const button = document.querySelector<HTMLButtonElement>("button")!;
  const other = document.querySelectorAll<HTMLButtonElement>("button")[1];
  const area = document.getElementById("social-factor")!, status = document.getElementById("social-status")!;
  const link = () => area.querySelector<HTMLAnchorElement>("a");
  async function poll(result: Record<string, unknown>) {
    await vi.waitFor(() => expect(timers).toHaveLength(1));
    results.push(result); timers.shift()!();
  }
  return { window, button, other, popup, requests, area, status, link, poll };
}

it.each([
  ["google", "https://accounts.google.com/o/oauth2/v2/auth?state=synthetic-google"],
  ["apple", "https://appleid.apple.com/auth/authorize?state=synthetic-apple"],
] as const)("offers the same %s flow with an open popup, then updates its saved connection and preserves unlink", async (provider, url) => {
  const p = page(provider, url);
  p.button.click();
  await vi.waitFor(() => expect(p.popup.location.replace).toHaveBeenCalledWith(url));
  expect(p.popup.opener).toBeNull();
  expect(p.link()?.href).toBe(url);
  expect(p.link()?.target).toBe("_blank");
  expect(p.link()?.rel).toBe("noopener noreferrer");
  expect(p.area.textContent).toContain("window stays blank");
  expect(p.area.textContent).toContain("Keep this page open");
  expect(p.button.disabled).toBe(true);
  expect(p.other.disabled).toBe(true);

  await p.poll({ pending: true });
  await vi.waitFor(() => expect(p.requests.filter(r => r.path.endsWith("/result"))).toHaveLength(1));
  expect(p.link()?.href).toBe(url);
  const start = p.requests.find(r => r.path.endsWith("/start"))!.body;
  const firstPoll = p.requests.find(r => r.path.endsWith("/result"))!.body;
  expect(firstPoll.requestId).toBe("synthetic-flow");
  expect(createHash("sha256").update(firstPoll.verifier).digest("base64url")).toBe(start.challenge);
  expect(start).toMatchObject({ provider, audience: "owner", purpose: "link" });

  await p.poll({ linked: true, provider });
  await vi.waitFor(() => expect(p.button.dataset.socialPurpose).toBe("unlink"));
  expect(p.button.textContent).toBe(`Disconnect ${provider === "google" ? "Google" : "Apple"}`);
  expect(p.other.dataset.socialPurpose).toBe("link");
  expect(p.area.childElementCount).toBe(0);
  expect(p.status.textContent).toContain("Sign-in method connected");
  expect(p.popup.close).toHaveBeenCalledOnce();
  expect(p.button.disabled).toBe(false);
  expect(p.other.disabled).toBe(false);

  p.button.click();
  await vi.waitFor(() => expect(p.status.textContent).toBe("Synthetic unlink failure"));
  expect(p.requests.at(-1)).toEqual({ path: "/api/auth/social/unlink", body: { provider, audience: "owner" } });
  expect(p.requests.filter(r => r.path.endsWith("/start"))).toHaveLength(1);
  expect(p.window.open).toHaveBeenCalledOnce();
  expect(p.button.dataset.socialPurpose).toBe("unlink");
  expect(p.button.disabled).toBe(false);
  expect(p.other.disabled).toBe(false);
});

it("keeps the same explicit link and polling when the popup is blocked", async () => {
  const url = "https://appleid.apple.com/auth/authorize?state=synthetic-blocked", p = page("apple", url, false);
  p.button.click();
  await vi.waitFor(() => expect(p.link()?.href).toBe(url));
  expect(p.popup.location.replace).not.toHaveBeenCalled();
  await p.poll({ pending: true });
  await vi.waitFor(() => expect(p.requests).toHaveLength(2));
  expect(p.requests[1]).toMatchObject({ path: "/api/auth/social/result", body: { requestId: "synthetic-flow" } });
  expect(p.link()?.href).toBe(url);
});

it("rejects a foreign provider destination before exposing a link or navigating the popup", async () => {
  const p = page("apple", "https://appleid.apple.com.foreign.example/auth/authorize");
  p.button.click();
  await vi.waitFor(() => expect(p.status.textContent).toBe("The provider address was not verified."));
  expect(p.link()).toBeNull();
  expect(p.popup.location.replace).not.toHaveBeenCalled();
  expect(p.popup.close).toHaveBeenCalledOnce();
  expect(p.requests).toHaveLength(1);
  expect(p.button.disabled).toBe(false);
  expect(p.other.disabled).toBe(false);
});
