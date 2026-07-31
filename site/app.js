const palette = {
  orange: "#ed914e",
  orangeDark: "#c7693f",
  cream: "#f1dfbd",
  brown: "#5f463e",
  dark: "#292d2b",
  pink: "#e8a4aa",
};

const canvas = document.querySelector("#hero-board");
const context = canvas?.getContext("2d");
const gridSize = 29;
let focusColor = "all";

function catCell(x, y) {
  const head = ((x - 14) / 8.3) ** 2 + ((y - 10.7) / 7.5) ** 2 < 1;
  const body = ((x - 14.5) / 9.5) ** 2 + ((y - 21.5) / 9) ** 2 < 1;
  const leftEar = y < 8 && x > 5 && x < 13 && y > -0.95 * (x - 7);
  const rightEar = y < 8 && x > 16 && x < 24 && y > 0.95 * (x - 22);
  const tail = x > 22 && y > 16 && ((x - 23) ** 2 + (y - 20) ** 2 < 32);
  if (!(head || body || leftEar || rightEar || tail)) return null;
  if ((x === 11 || x === 18) && y >= 10 && y <= 11) return [palette.dark, "brown"];
  if (y === 14 && x >= 13 && x <= 16) return [palette.cream, "cream"];
  if (y === 13 && (x === 14 || x === 15)) return [palette.pink, "pink"];
  if (y >= 14 && y <= 17 && x >= 10 && x <= 19) return [palette.cream, "cream"];
  if ((leftEar || rightEar) && y < 5) return [palette.pink, "pink"];
  if (body && x > 17 && y > 19) return [palette.orangeDark, "orange"];
  if (body && x < 11 && y > 22) return [palette.cream, "cream"];
  if (head && ((x + y) % 9 === 0 || (x > 18 && y < 12))) return [palette.orangeDark, "orange"];
  return [palette.orange, "orange"];
}

function drawBoard() {
  if (!context || !canvas) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const cssSize = canvas.clientWidth || 380;
  canvas.width = cssSize * ratio;
  canvas.height = cssSize * ratio;
  context.scale(ratio, ratio);
  const cell = cssSize / gridSize;
  context.clearRect(0, 0, cssSize, cssSize);
  context.fillStyle = "#34403d";
  context.fillRect(0, 0, cssSize, cssSize);

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const cx = (x + 0.5) * cell;
      const cy = (y + 0.5) * cell;
      const bead = catCell(x, y);
      context.beginPath();
      context.arc(cx, cy, cell * 0.36, 0, Math.PI * 2);
      if (!bead) {
        context.fillStyle = "rgba(16,23,21,.58)";
        context.fill();
        context.beginPath();
        context.arc(cx, cy, cell * 0.085, 0, Math.PI * 2);
        context.fillStyle = "rgba(103,123,117,.46)";
        context.fill();
        continue;
      }
      const [color, group] = bead;
      const dimmed = focusColor !== "all" && focusColor !== group;
      context.globalAlpha = dimmed ? 0.13 : 1;
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = dimmed ? "transparent" : "rgba(255,255,255,.24)";
      context.lineWidth = Math.max(0.6, cell * 0.06);
      context.stroke();
      context.beginPath();
      context.arc(cx - cell * 0.08, cy - cell * 0.1, cell * 0.08, 0, Math.PI * 2);
      context.fillStyle = "rgba(255,255,255,.24)";
      context.fill();
      context.globalAlpha = 1;
    }
  }
}

document.querySelectorAll(".color-chip").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".color-chip").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    focusColor = button.dataset.color || "all";
    drawBoard();
  });
});

const appWindow = document.querySelector("#app-window");
const orbit = document.querySelector("#product-orbit");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (orbit && appWindow && !reducedMotion && window.innerWidth > 760) {
  orbit.addEventListener("pointermove", (event) => {
    const box = orbit.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    appWindow.style.transform = `rotateY(${x * 5 - 3}deg) rotateX(${-y * 4 + 1}deg) translateY(-3px)`;
  });
  orbit.addEventListener("pointerleave", () => {
    appWindow.style.transform = "rotateY(-3deg) rotateX(1deg)";
  });
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((element, index) => {
  element.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
  observer.observe(element);
});

document.querySelectorAll("[data-detail]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-detail]").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    const values = {
      low: ["3.82", "6.21", "8.74"],
      medium: ["2.14", "4.87", "7.02"],
      high: ["1.62", "3.44", "5.81"],
    };
    document.querySelectorAll(".match-list em").forEach((item, index) => {
      item.textContent = values[button.dataset.detail][index];
    });
  });
});

function resolveRepositoryLinks() {
  const onPages = window.location.hostname.endsWith("github.io");
  const owner = onPages ? window.location.hostname.split(".")[0] : "Hanqing";
  const pathRepo = window.location.pathname.split("/").filter(Boolean)[0];
  const repo = onPages && pathRepo ? pathRepo : "PerlerBeads";
  const repositoryUrl = `https://github.com/${owner}/${repo}`;
  document.querySelectorAll(".github-link").forEach((link) => { link.href = repositoryUrl; });
  document.querySelectorAll(".download-link").forEach((link) => { link.href = `${repositoryUrl}/releases/latest/download/BeadGrid_0.1.0_aarch64.dmg`; });
  const clone = document.querySelector(".clone-button");
  if (clone) clone.dataset.command = `git clone git@github.com:${owner}/${repo}.git`;
}

const toast = document.querySelector(".toast");
document.querySelector(".clone-button")?.addEventListener("click", async (event) => {
  await navigator.clipboard.writeText(event.currentTarget.dataset.command);
  toast?.classList.add("is-visible");
  window.setTimeout(() => toast?.classList.remove("is-visible"), 1800);
});

document.querySelector("#year").textContent = new Date().getFullYear();
resolveRepositoryLinks();
drawBoard();
window.addEventListener("resize", drawBoard);
