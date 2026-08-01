const root = document.documentElement;
const themeButton = document.querySelector("[data-theme-toggle]");
const menuButton = document.querySelector("[data-menu-toggle]");
const navigation = document.querySelector("[data-navigation]");
const savedTheme = localStorage.getItem("witc-theme");

if (savedTheme === "dark" || savedTheme === "light") root.dataset.theme = savedTheme;

themeButton?.addEventListener("click", () => {
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  localStorage.setItem("witc-theme", next);
  themeButton.setAttribute("aria-label", `Use ${next === "dark" ? "light" : "dark"} theme`);
});

menuButton?.addEventListener("click", () => {
  const open = navigation?.dataset.open !== "true";
  if (navigation) navigation.dataset.open = String(open);
  menuButton.setAttribute("aria-expanded", String(open));
});

const currentPage = location.pathname.split("/").pop() || "index.html";
document.querySelectorAll("[data-navigation] a").forEach((link) => {
  if (link.getAttribute("href") === currentPage) link.setAttribute("aria-current", "page");
});

const participantInput = document.querySelector("[data-participants]");
const feeInput = document.querySelector("[data-fee-rate]");
const demoSvg = document.querySelector("[data-constellation]");

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function drawConstellation(participants) {
  if (!demoSvg) return;
  while (demoSvg.firstChild) demoSvg.removeChild(demoSvg.firstChild);
  const namespace = "http://www.w3.org/2000/svg";
  const center = 210;
  const radius = 148;
  for (let index = 0; index < participants; index += 1) {
    const angle = (Math.PI * 2 * index) / participants - Math.PI / 2;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    const line = document.createElementNS(namespace, "line");
    line.setAttribute("x1", String(center));
    line.setAttribute("y1", String(center));
    line.setAttribute("x2", String(x));
    line.setAttribute("y2", String(y));
    line.setAttribute("class", "orbit-line");
    demoSvg.append(line);
    const node = document.createElementNS(namespace, "circle");
    node.setAttribute("cx", String(x));
    node.setAttribute("cy", String(y));
    node.setAttribute("r", participants > 10 ? "10" : "14");
    node.setAttribute("class", "orbit-node");
    demoSvg.append(node);
  }
  const centerNode = document.createElementNS(namespace, "rect");
  centerNode.setAttribute("x", "184");
  centerNode.setAttribute("y", "184");
  centerNode.setAttribute("width", "52");
  centerNode.setAttribute("height", "52");
  centerNode.setAttribute("rx", "8");
  centerNode.setAttribute("class", "orbit-center");
  demoSvg.append(centerNode);
}

function updateDemo() {
  if (!(participantInput instanceof HTMLInputElement) || !(feeInput instanceof HTMLInputElement))
    return;
  const participants = Number(participantInput.value);
  const feeRate = Number(feeInput.value);
  const vbytes = Math.ceil((246 + 402 * participants) / 4);
  const fee = vbytes * feeRate;
  const quotient = Math.floor(fee / participants);
  const remainder = fee % participants;
  setText("[data-participant-value]", String(participants));
  setText("[data-fee-value]", `${feeRate} sat/vB`);
  setText("[data-vbytes]", `${vbytes.toLocaleString()} vB`);
  setText("[data-total-fee]", `${fee.toLocaleString()} sats`);
  setText(
    "[data-fee-share]",
    `${quotient.toLocaleString()}${remainder ? ` or ${(quotient + 1).toLocaleString()}` : ""} sats`,
  );
  setText(
    "[data-demo-caption]",
    `${participants} output keys commit to one exact transaction. No identity claim.`,
  );
  drawConstellation(participants);
}

participantInput?.addEventListener("input", updateDemo);
feeInput?.addEventListener("input", updateDemo);
updateDemo();

const search = document.querySelector("[data-doc-search]");
search?.addEventListener("input", () => {
  const query = search instanceof HTMLInputElement ? search.value.trim().toLowerCase() : "";
  document.querySelectorAll("[data-doc-card]").forEach((card) => {
    const text = card.textContent?.toLowerCase() ?? "";
    card.toggleAttribute("hidden", query.length > 0 && !text.includes(query));
  });
});
