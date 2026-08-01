import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type HTMLButtonElement,
  type HTMLElement,
  type HTMLImageElement,
  type HTMLInputElement,
  Window,
} from "happy-dom";

function loadPage(filename: string): Window {
  const window = new Window({ url: `http://127.0.0.1/${filename}` });
  window.document.write(readFileSync(resolve("site", filename), "utf8"));
  window.eval(readFileSync(resolve("site/assets/app.js"), "utf8"));
  return window;
}

describe("static documentation site", () => {
  it("updates the local fee and constellation demonstration", () => {
    const window = loadPage("index.html");
    const participantInput = window.document.querySelector(
      "[data-participants]",
    ) as HTMLInputElement | null;
    const feeInput = window.document.querySelector("[data-fee-rate]") as HTMLInputElement | null;
    if (participantInput === null || feeInput === null) throw new Error("Demo controls missing");
    participantInput.value = "4";
    feeInput.value = "25";
    participantInput.dispatchEvent(new window.Event("input"));
    feeInput.dispatchEvent(new window.Event("input"));
    expect(window.document.querySelector("[data-vbytes]")?.textContent).toBe("464 vB");
    expect(window.document.querySelector("[data-total-fee]")?.textContent?.replace(/\D/g, "")).toBe(
      "11600",
    );
    expect(window.document.querySelectorAll("[data-constellation] .orbit-node")).toHaveLength(4);
    window.close();
  });

  it("supports theme, navigation, and documentation search without a network request", () => {
    const window = loadPage("docs.html");
    const theme = window.document.querySelector("[data-theme-toggle]") as HTMLButtonElement | null;
    const menu = window.document.querySelector("[data-menu-toggle]") as HTMLButtonElement | null;
    const search = window.document.querySelector("[data-doc-search]") as HTMLInputElement | null;
    if (theme === null || menu === null || search === null)
      throw new Error("Site controls missing");
    theme.click();
    menu.click();
    expect(window.document.documentElement.dataset["theme"]).toBe("dark");
    expect(window.document.querySelector("[data-navigation]")?.getAttribute("data-open")).toBe(
      "true",
    );
    search.value = "wallet";
    search.dispatchEvent(new window.Event("input"));
    const cards = [...window.document.querySelectorAll("[data-doc-card]")] as HTMLElement[];
    const visible = cards.filter((card) => !card.hasAttribute("hidden"));
    expect(visible).toHaveLength(1);
    expect(visible[0]?.textContent).toContain("Wallet team");
    window.close();
  });

  it("publishes the reviewed raster card with matching metadata and accessible text", () => {
    const image = readFileSync(resolve("site/assets/og-card.png"));
    expect(image.toString("ascii", 1, 4)).toBe("PNG");
    expect(image.readUInt32BE(16)).toBe(1731);
    expect(image.readUInt32BE(20)).toBe(909);

    const index = loadPage("index.html");
    const imageUrl =
      "https://raw.githubusercontent.com/bitcoinuniverse/witness-circles/main/site/assets/og-card.png";
    expect(index.document.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      imageUrl,
    );
    expect(
      index.document.querySelector('meta[property="og:image:width"]')?.getAttribute("content"),
    ).toBe("1731");
    expect(
      index.document.querySelector('meta[property="og:image:height"]')?.getAttribute("content"),
    ).toBe("909");
    expect(
      index.document.querySelector('meta[name="twitter:image"]')?.getAttribute("content"),
    ).toBe(imageUrl);
    index.close();

    const press = loadPage("press.html");
    const pressImage = press.document.querySelector(".press-asset img") as HTMLImageElement | null;
    expect(pressImage?.getAttribute("src")).toBe("assets/og-card.png");
    expect(pressImage?.getAttribute("width")).toBe("1731");
    expect(pressImage?.getAttribute("height")).toBe("909");
    expect(pressImage?.getAttribute("alt")).toBe(
      "Six independent key nodes connected to one exact Bitcoin transaction",
    );
    press.close();
  });
});
