// Smoke test for dsh-quote-reply's client bundle body (no browser needed).
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const code = fs.readFileSync(path.join(__dirname, "..", "lib", "client.js"), "utf8");

// ---- minimal DOM stubs ----
function makeEl(tag) {
  return {
    tag, style: {}, attributes: {}, listeners: {}, children: [], dataset: {},
    type: "", className: "", title: "", _innerHTML: "", value: "",
    offsetWidth: 28, offsetHeight: 28, focused: false,
    set innerHTML(v) { this._innerHTML = v; },
    get innerHTML() { return this._innerHTML; },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; },
    addEventListener(ev, fn) { (this.listeners[ev] ??= []).push(fn); },
    removeEventListener(ev, fn) { this.listeners[ev] = (this.listeners[ev] || []).filter((f) => f !== fn); },
    appendChild(c) { this.children.push(c); },
    focus() { this.focused = true; },
    setSelectionRange() {},
    querySelector() { return null; },
    closest() { return null; },
    contains() { return false; },
    getBoundingClientRect() {
      const px = (v) => (v === "" || v === void 0 ? 0 : parseFloat(v));
      return { left: px(this.style.left), top: px(this.style.top), width: this.offsetWidth, height: this.offsetHeight };
    }
  };
}
const docListeners = {};
const documentStub = {
  listeners: docListeners,
  addEventListener(ev, fn) { (docListeners[ev] ??= []).push(fn); },
  removeEventListener(ev, fn) { docListeners[ev] = (docListeners[ev] || []).filter((f) => f !== fn); },
  createElement(tag) { return makeEl(tag); },
  querySelector() { return null; },
  elementFromPoint(x, y) { return this.body; },
  body: makeEl("body"),
  head: makeEl("head")
};
const win = { innerWidth: 1280, innerHeight: 800, getSelection: null };

const sandbox = { console, setTimeout, clearTimeout, document: documentStub, window: win };
vm.createContext(sandbox);
vm.runInContext("window.__ModuleLoader__ = { load: (h) => { __handoff = h; } }; " + code, sandbox);
const handoff = vm.runInContext("__handoff", sandbox);
if (!handoff || handoff.id !== "dsh-quote-reply") throw new Error("factory not registered with correct id");

const requires = new Map([
  ["react/jsx-runtime", { jsx: (...a) => a, jsxs: (...a) => a }],
  ["react", { useRef: (v) => ({ current: v }), useEffect: (fn) => { fn(); } }]
]);
const mod = handoff.factory((spec) => {
  if (!requires.has(spec)) throw new Error("unexpected require: " + spec);
  return requires.get(spec);
});
if (typeof mod.apply !== "function" || !Array.isArray(mod.inject)) throw new Error("module exports malformed");

// ---- apply() ----
let registered = null;
const ctx = {
  effect: (fn, label) => { fn(); return () => {}; },
  locale: { register: (ns, dicts) => { if (ns !== "quoteReply" || !dicts.zh["action.quoteSelected"]) throw new Error("bad dicts"); } },
  slots: {
    inject: (name, fn) => { if (name !== "conversation.chat.assistant-actions") throw new Error("bad slot"); fn(); },
    register: (opts, comp) => { registered = { opts, comp }; return () => {}; }
  }
};
mod.apply(ctx);
if (!registered || registered.opts.id !== "quote-reply") throw new Error("slot not registered");
if (!docListeners["mouseup"] || !docListeners["selectionchange"] || !docListeners["scroll"]) throw new Error("watcher listeners missing");

(async () => {
  // ---- component mount: registers toolbar + applicator ----
  const calls = [];
  const fakeChat = {
    nodes: {
      values: () => [{
        data: {
          finalNode: {
            messageId: "m1",
            blocks: [{ kind: "text", text: "第2步：提审 4 个 bot" }]
          }
        }
      }]
    }
  };
  const fakeSession = { chat: fakeChat };
  const props = {
    messageId: "m1",
    t: (k) => k,
    useChat: (sel) => sel(fakeChat),
    useSession: (sel) => sel(fakeSession),
    useInput: (sel) => sel({ draft: "" }),
    inputActions: { setDraft: (t) => calls.push(["setDraft", t]) }
  };
  const out = registered.comp(props);
  const actionBtn = out[1];
  if (actionBtn["aria-label"] !== "action.quote") throw new Error("action button wrong");

  const floatBtn = documentStub.body.children.find((c) => c.className === "dsh-quote-reply-float");
  if (!floatBtn) throw new Error("floating toolbar not created on mount");
  if (floatBtn.attributes["title"] !== "action.quoteSelected") throw new Error("toolbar title not localized");
  if (floatBtn.style.display === "inline-flex") throw new Error("toolbar should start hidden (CSS display:none)");

  // ---- simulate a text selection, then mouseup at (110, 205) ----
  let rangesCleared = 0;
  const chatFlowEl = makeEl("div");
  chatFlowEl.closest = (sel) => (sel.includes("data-chat-flow") ? chatFlowEl : null);
  const outsideEl = makeEl("div");
  const overlayEl = makeEl("div"); // simulates a foreign overlay (extension toolbar)
  const selectionStub = {
    isCollapsed: false,
    rangeCount: 1,
    toString: () => " 某几个字 ",
    removeAllRanges: () => { rangesCleared += 1; },
    getRangeAt: () => ({
      commonAncestorContainer: chatFlowEl,
      getBoundingClientRect: () => ({ left: 100, top: 200, right: 150, bottom: 212 }),
      cloneRange: () => ({ collapse() {}, getBoundingClientRect: () => ({ left: 150, top: 200, right: 150, bottom: 212 }) })
    })
  };
  win.getSelection = () => selectionStub;
  docListeners["mouseup"][0]({ clientX: 110, clientY: 205 });
  docListeners["selectionchange"][0]();
  await sleep(80);
  if (floatBtn.style.display !== "inline-flex") throw new Error("toolbar did not show on selection: " + floatBtn.style.display);
  if (floatBtn.style.top !== "191px") throw new Error("toolbar should anchor right of the mouse: " + floatBtn.style.top);
  if (floatBtn.style.left !== "118px") throw new Error("toolbar x wrong (mouse anchor): " + floatBtn.style.left);

  // ---- first candidate blocked by a foreign overlay → next candidate wins ----
  documentStub.elementFromPoint = (x, y) => (x === 132 && y === 205 ? overlayEl : documentStub.body);
  docListeners["selectionchange"][0]();
  await sleep(80);
  if (floatBtn.style.top !== "213px") throw new Error("toolbar should avoid the blocked spot (below-right): " + floatBtn.style.top);
  if (floatBtn.style.left !== "118px") throw new Error("toolbar x wrong after avoidance: " + floatBtn.style.left);
  documentStub.elementFromPoint = (x, y) => documentStub.body;

  // ---- click the floating button → quote applied to the draft ----
  floatBtn.listeners["click"][0]();
  const setDraft = calls.find((c) => c[0] === "setDraft");
  if (!setDraft) throw new Error("floating click did not set draft");
  if (setDraft[1] !== "> 某几个字") throw new Error("floating quote wrong: " + JSON.stringify(setDraft[1]));
  if (floatBtn.style.display !== "none") throw new Error("toolbar should hide after click");

  // ---- selection near the top edge: above-spot blocked → falls below ----
  documentStub.elementFromPoint = (x, y) => (y < 25 ? overlayEl : documentStub.body);
  win.getSelection = () => ({
    isCollapsed: false,
    rangeCount: 1,
    toString: () => "顶部",
    removeAllRanges: () => { rangesCleared += 1; },
    getRangeAt: () => ({
      commonAncestorContainer: chatFlowEl,
      getBoundingClientRect: () => ({ left: 50, top: 2, right: 80, bottom: 14 }),
      cloneRange: () => ({ collapse() {}, getBoundingClientRect: () => ({ left: 80, top: 2, right: 80, bottom: 14 }) })
    })
  });
  docListeners["selectionchange"][0]();
  await sleep(80);
  if (floatBtn.style.display !== "inline-flex") throw new Error("toolbar did not show for top selection");
  if (floatBtn.style.top !== "20px") throw new Error("toolbar should fall below when above is blocked: " + floatBtn.style.top);
  if (floatBtn.style.left !== "66px") throw new Error("toolbar x wrong for fallback: " + floatBtn.style.left);
  documentStub.elementFromPoint = (x, y) => documentStub.body;

  // ---- Escape hides the toolbar and clears the selection ----
  docListeners["keydown"][0]({ key: "Escape" });
  if (floatBtn.style.display === "inline-flex") throw new Error("toolbar should hide on Escape");
  if (rangesCleared !== 2) throw new Error("Escape should clear ranges (click 1 + escape 1): " + rangesCleared);

  // ---- selection outside the chat flow area never shows the toolbar ----
  win.getSelection = () => ({
    isCollapsed: false,
    rangeCount: 1,
    toString: () => "侧边栏文字",
    removeAllRanges: () => {},
    getRangeAt: () => ({
      commonAncestorContainer: outsideEl,
      cloneRange: () => ({ collapse() {}, getBoundingClientRect: () => ({ left: 0, top: 0, right: 10, bottom: 10 }) })
    })
  });
  docListeners["selectionchange"][0]();
  await sleep(80);
  if (floatBtn.style.display === "inline-flex") throw new Error("toolbar should NOT show outside chat-flow");

  // ---- collapsed selection hides the toolbar ----
  win.getSelection = () => ({ isCollapsed: true, rangeCount: 0, toString: () => "", removeAllRanges: () => {} });
  docListeners["selectionchange"][0]();
  await sleep(80);
  if (floatBtn.style.display !== "none") throw new Error("toolbar should hide on collapsed selection");

  // ---- action-row button: selection path ----
  const out2 = registered.comp({ ...props, useInput: (sel) => sel({ draft: "之前的草稿" }) });
  win.getSelection = () => ({ isCollapsed: false, rangeCount: 1, toString: () => " 选中步骤 ", removeAllRanges: () => { rangesCleared += 1; } });
  out2[1].onMouseDown({ preventDefault: () => calls.push(["preventDefault"]) });
  out2[1].onClick();
  const setDraft2 = calls.find((c) => c[0] === "setDraft" && c[1] === "之前的草稿\n\n> 选中步骤");
  if (!setDraft2) throw new Error("action selection quote wrong: " + JSON.stringify(calls));
  if (!calls.some((c) => c[0] === "preventDefault")) throw new Error("selection not preserved");
  if (rangesCleared !== 3) throw new Error("selection not cleared after action quote (click+escape+action): " + rangesCleared);

  // ---- action-row button: whole-message fallback ----
  const out3 = registered.comp({ ...props, useInput: (sel) => sel({ draft: "" }) });
  win.getSelection = () => ({ isCollapsed: false, rangeCount: 1, toString: () => "   ", removeAllRanges: () => {} });
  out3[1].onMouseDown({ preventDefault: () => {} });
  out3[1].onClick();
  const setDraft3 = calls.find((c) => c[0] === "setDraft" && c[1] === "> 第2步：提审 4 个 bot");
  if (!setDraft3) throw new Error("whole-message fallback wrong: " + JSON.stringify(calls));

  // ---- legacy hosts: no useChat prop, chat snapshot lives on useSession ----
  const legacySession = { chat: { nodes: { values: () => [{ data: { finalNode: { messageId: "m1", blocks: [{ kind: "text", text: "旧版快照正文" }] } } }] } } };
  const out4 = registered.comp({ ...props, useChat: undefined, useSession: (sel) => sel(legacySession), useInput: (sel) => sel({ draft: "" }) });
  win.getSelection = () => ({ isCollapsed: false, rangeCount: 1, toString: () => "   ", removeAllRanges: () => {} });
  out4[1].onMouseDown({ preventDefault: () => {} });
  out4[1].onClick();
  const setDraft4 = calls.find((c) => c[0] === "setDraft" && c[1] === "> 旧版快照正文");
  if (!setDraft4) throw new Error("legacy session-snapshot fallback wrong: " + JSON.stringify(calls));

  console.log("ALL SMOKE TESTS PASSED");
})().catch((e) => { console.error(e); process.exit(1); });
