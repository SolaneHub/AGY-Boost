import { spawn } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function findChromeExecutable() {
  if (process.env.CHROME_BIN) {
    if (fs.existsSync(process.env.CHROME_BIN)) {
      return process.env.CHROME_BIN;
    }
    return null;
  }

  const platform = os.platform();
  const candidates = [];

  if (platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    );
  } else if (platform === "linux") {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium"
    );
  } else if (platform === "win32") {
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const localAppData = process.env["LOCALAPPDATA"] || "";
    candidates.push(
      path.join(programFiles, "Google/Chrome/Application/chrome.exe"),
      path.join(programFilesX86, "Google/Chrome/Application/chrome.exe"),
      path.join(localAppData, "Google/Chrome/Application/chrome.exe")
    );
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

const CHROME_PATH = findChromeExecutable();
const FIXTURE_PATH = path.resolve("tests/fixtures/mock-antigravity.html");
const PORT = 9444;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendCDP(webSocketUrl, method, params = {}) {
  const socket = new WebSocket(webSocketUrl);
  let timer;
  try {
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("CDP socket open failed")), {
        once: true,
      });
    });

    const id = Math.floor(Math.random() * 1000000);
    const reply = new Promise((resolve, reject) => {
      const messageHandler = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.id !== id) return;
          clearTimeout(timer);
          socket.removeEventListener("message", messageHandler);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        } catch (err) {
          clearTimeout(timer);
          socket.removeEventListener("message", messageHandler);
          reject(err);
        }
      };

      socket.addEventListener("message", messageHandler);
      timer = setTimeout(() => {
        socket.removeEventListener("message", messageHandler);
        reject(new Error(`CDP ${method} timed out`));
      }, 30000);
    });

    socket.send(JSON.stringify({ id, method, params }));
    return await reply;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    socket.close();
  }
}

async function evalInPage(wsUrl, expression) {
  const result = await sendCDP(wsUrl, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`Eval failed: ${JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result?.value;
}

async function main() {
  if (!CHROME_PATH) {
    console.warn("Chrome/Chromium executable not found. Skipping E2E flexbox invariant test.");
    process.exit(0);
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "agy-test-chrome-"));
  const fixtureUrl = pathToFileURL(FIXTURE_PATH).href;

  const chromeProc = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-background-networking",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${tmpDir}`,
      fixtureUrl,
    ],
    { stdio: "ignore" }
  );

  let allPassed = false;

  try {
    let targets = null;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        if (res.ok) {
          targets = await res.json();
          const page = targets.find((t) => t.type === "page");
          if (page) break;
        }
      } catch {}
      await delay(250);
    }

    if (!targets) throw new Error("Could not connect to Chrome DevTools port");
    const pageTarget = targets.find((t) => t.type === "page");
    if (!pageTarget) throw new Error("No page target found");
    const wsUrl = pageTarget.webSocketDebuggerUrl;

    await delay(300);

    // Wait for fixture to load and elements to be mounted
    for (let i = 0; i < 40; i++) {
      const ready = await evalInPage(
        wsUrl,
        `
        Boolean(document.querySelector('[data-testid="conversation-view"]') && document.querySelector('[data-agy-boost-mods-btn="true"]'))
      `
      );
      if (ready) break;
      await delay(100);
    }

    const report = {
      sidebarButtonMounted: false,
      initialFlexState: null,
      modsViewOpened: false,
      marketplaceRendered: false,
      installedTabRendered: false,
      modsViewClosed: false,
      finalFlexState: null,
      noInlineDisplayBlock: true,
      allPassed: false,
    };

    // 1. Check sidebar button
    const hasSidebarBtn = await evalInPage(
      wsUrl,
      `
      Boolean(document.querySelector('[data-agy-boost-mods-btn="true"]'))
    `
    );
    report.sidebarButtonMounted = Boolean(hasSidebarBtn);

    // Initial state check of conversation-view
    report.initialFlexState = await evalInPage(
      wsUrl,
      `(() => {
      const conv = document.querySelector('[data-testid="conversation-view"]');
      const child0 = document.getElementById('child-0-messages');
      const child1 = document.getElementById('child-1-composer');
      const style = window.getComputedStyle(conv);
      return {
        display: style.display,
        flexDirection: style.flexDirection,
        inlineDisplay: conv.style.display,
        child0Height: child0.clientHeight,
        child1Height: child1.clientHeight,
      };
    })()`
    );

    // 2. Click "Mods" button to open view
    await evalInPage(
      wsUrl,
      `
      document.querySelector('[data-agy-boost-mods-btn="true"]').click()
    `
    );
    await delay(500);

    report.modsViewOpened = await evalInPage(
      wsUrl,
      `(() => {
      const view = document.getElementById('agy-boost-mods-view');
      const conv = document.querySelector('[data-testid="conversation-view"]');
      const convParent = conv ? conv.parentElement : null;
      return Boolean(view) && (conv.style.display === 'none' || (convParent && convParent.style.display === 'none'));
    })()`
    );

    // 3. Switch to / check Marketplace tab
    await evalInPage(
      wsUrl,
      `(() => {
      const tabs = document.querySelectorAll('[data-testid="plugins-tabs"] button, [data-testid="mods-tabs"] button');
      for (const t of tabs) {
        if (t.textContent.includes('Marketplace')) {
          t.click();
          break;
        }
      }
    })()`
    );
    await delay(500);

    report.marketplaceRendered = await evalInPage(
      wsUrl,
      `(() => {
      const spotlight = document.querySelector('[data-testid="featured-carousel"]') || document.querySelector('.agy-spotlight-host');
      const categoryCards = document.querySelectorAll('[data-testid="customization-card"]');
      return Boolean(spotlight) && categoryCards.length > 0;
    })()`
    );

    // 3b. Test 1:1 Mod Detail View Navigation from Marketplace
    await evalInPage(
      wsUrl,
      `(() => {
      const card = document.querySelector('[data-card-name="Effort Optimizer"] a') || document.querySelector('[data-card-name="Effort Optimizer"]');
      if (card) card.click();
    })()`
    );
    await delay(500);

    report.modDetailRendered = await evalInPage(
      wsUrl,
      `(() => {
      const detail = document.querySelector('[data-testid="plugin-detail"]');
      const h1 = detail ? detail.querySelector('h1') : null;
      const prompts = detail ? detail.querySelectorAll('[data-testid="plugin-suggested-prompt-row"]') : [];
      const tabs = detail ? detail.querySelectorAll('[role="tab"]') : [];
      const footer = detail ? detail.querySelector('[data-testid="plugin-detail-footer"]') : null;
      return Boolean(detail) && Boolean(h1 && h1.textContent.includes('Effort Optimizer')) && prompts.length > 0 && tabs.length === 2 && Boolean(footer);
    })()`
    );

    // Click Back to return to Marketplace
    await evalInPage(
      wsUrl,
      `(() => {
      const back = document.querySelector('[data-testid="plugin-detail-back-button"]');
      if (back) back.click();
    })()`
    );
    await delay(500);

    // 4. Switch to Installed tab
    await evalInPage(
      wsUrl,
      `(() => {
      const tabs = document.querySelectorAll('[data-testid="plugins-tabs"] button, [data-testid="mods-tabs"] button');
      for (const t of tabs) {
        if (t.textContent.includes('Installed')) {
          t.click();
          break;
        }
      }
    })()`
    );
    await delay(500);

    report.installedTabRendered = await evalInPage(
      wsUrl,
      `(() => {
      const view = document.getElementById('agy-boost-mods-view');
      const headers = Array.from(view.querySelectorAll('h2, h3')).map(h => h.textContent.trim());
      const hasInstalledHeader = headers.some(h => h.includes('Installed Mods'));
      const hasEnginesHeader = headers.some(h => h.includes('Engine') || h.includes('Installed Engines'));
      return hasInstalledHeader && hasEnginesHeader;
    })()`
    );

    // 5. Verify Navigation Active/Hover Loop including New Conversation
    report.sidebarNavLoop = await evalInPage(
      wsUrl,
      `(() => {
      const mods = document.querySelector('[data-agy-boost-mods-btn="true"]');
      const auto = document.querySelector('[data-testid="automations-button"]');
      const cust = Array.from(document.querySelectorAll('[data-testid="sidebar-navigation-items"] > *')).find(el => el.textContent.includes('Customizations'));
      const newChat = document.querySelector('[data-testid="new-conversation-button"]');

      // Check 1: In Mods view, mods is active, others have hover
      const step1 = mods.classList.contains('bg-sidebar-secondary') &&
                    auto.classList.contains('hover:bg-sidebar-muted') &&
                    !auto.classList.contains('bg-sidebar-secondary') &&
                    cust.classList.contains('hover:bg-sidebar-muted') &&
                    !cust.classList.contains('bg-sidebar-secondary') &&
                    newChat.classList.contains('hover:bg-sidebar-secondary') &&
                    !newChat.classList.contains('bg-sidebar-secondary');

      // Step 2: Click Customizations
      cust.click();
      const step2 = !mods.classList.contains('bg-sidebar-secondary') &&
                    mods.classList.contains('hover:bg-sidebar-muted') &&
                    cust.classList.contains('bg-sidebar-secondary') &&
                    auto.classList.contains('hover:bg-sidebar-muted') &&
                    !auto.classList.contains('bg-sidebar-secondary') &&
                    newChat.classList.contains('hover:bg-sidebar-secondary') &&
                    !newChat.classList.contains('bg-sidebar-secondary');

      // Step 3: Click Automations
      auto.click();
      const step3 = !mods.classList.contains('bg-sidebar-secondary') &&
                    mods.classList.contains('hover:bg-sidebar-muted') &&
                    !cust.classList.contains('bg-sidebar-secondary') &&
                    cust.classList.contains('hover:bg-sidebar-muted') &&
                    auto.classList.contains('bg-sidebar-secondary') &&
                    newChat.classList.contains('hover:bg-sidebar-secondary') &&
                    !newChat.classList.contains('bg-sidebar-secondary');

      // Step 4: Click New Conversation
      newChat.click();
      const step4 = newChat.classList.contains('bg-sidebar-secondary') &&
                    !newChat.classList.contains('bg-sidebar-muted') &&
                    !mods.classList.contains('bg-sidebar-secondary') &&
                    mods.classList.contains('hover:bg-sidebar-muted') &&
                    !auto.classList.contains('bg-sidebar-secondary') &&
                    auto.classList.contains('hover:bg-sidebar-muted') &&
                    !cust.classList.contains('bg-sidebar-secondary') &&
                    cust.classList.contains('hover:bg-sidebar-muted');

      // Step 5: Click Mods
      mods.click();
      const step5 = mods.classList.contains('bg-sidebar-secondary') &&
                    auto.classList.contains('hover:bg-sidebar-muted') &&
                    !auto.classList.contains('bg-sidebar-secondary') &&
                    cust.classList.contains('hover:bg-sidebar-muted') &&
                    !cust.classList.contains('bg-sidebar-secondary') &&
                    newChat.classList.contains('hover:bg-sidebar-secondary') &&
                    !newChat.classList.contains('bg-sidebar-secondary');

      return { step1, step2, step3, step4, step5, all: step1 && step2 && step3 && step4 && step5 };
    })()`
    );

    // 6. Close Mods View via clicking sidebar button again
    await evalInPage(
      wsUrl,
      `
      document.querySelector('[data-agy-boost-mods-btn="true"]').click()
    `
    );
    await delay(500);

    const isClosed = await evalInPage(
      wsUrl,
      `
      document.getElementById('agy-boost-mods-view') === null
    `
    );
    report.modsViewClosed = Boolean(isClosed);

    // Final Flex State & Invariant Check
    report.finalFlexState = await evalInPage(
      wsUrl,
      `(() => {
      const conv = document.querySelector('[data-testid="conversation-view"]');
      const child0 = document.getElementById('child-0-messages');
      const child1 = document.getElementById('child-1-composer');
      const style = window.getComputedStyle(conv);
      return {
        display: style.display,
        flexDirection: style.flexDirection,
        inlineDisplay: conv.style.display,
        child0Height: child0.clientHeight,
        child1Height: child1.clientHeight,
      };
    })()`
    );

    report.noInlineDisplayBlock =
      report.finalFlexState.inlineDisplay !== "block" && report.finalFlexState.display === "flex";

    const flexGrowPreserved = report.finalFlexState.child0Height > 0;

    report.allPassed =
      report.sidebarButtonMounted &&
      report.modsViewOpened &&
      report.marketplaceRendered &&
      report.installedTabRendered &&
      Boolean(report.sidebarNavLoop?.all) &&
      report.modsViewClosed &&
      report.noInlineDisplayBlock &&
      flexGrowPreserved;

    allPassed = report.allPassed;
    console.log(JSON.stringify(report, null, 2));

    if (!report.allPassed) {
      process.exit(1);
    }
  } finally {
    chromeProc.kill("SIGKILL");
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    if (allPassed) {
      process.exit(0);
    }
  }
}

main().catch((err) => {
  console.error("Test failed with exception:", err);
  process.exit(1);
});
