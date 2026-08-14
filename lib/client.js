// dsh-quote-reply — browser half, hand-written in the dsh client-bundle format.
// Two quote surfaces:
//   1. a floating 引用 button that pops up beside the mouse right after a text
//      selection, choosing the first spot that no other overlay (browser
//      extension toolbars, menus, modals) occupies — anchored near the mouse
//      release point, with the selection end as fallback;
//   2. the 引用 action in the assistant-message action strip (fallback:
//      quotes the selection when there is one, otherwise the whole message).
// Both insert the quote as a Markdown blockquote into the composer draft and
// focus the textarea so the user can reply right away.
window.__ModuleLoader__.load({
	id: "dsh-quote-reply",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");

		const NS = "quoteReply";

		const zh = {
			"action.quote": "引用",
			"action.quoteSelected": "引用选中文字",
			"action.quoteWhole": "引用整条回复"
		};
		const en = {
			"action.quote": "Quote",
			"action.quoteSelected": "Quote selection",
			"action.quoteWhole": "Quote the whole message"
		};

		/** Concatenate the visible prose of one assistant message. */
		function textOfBlocks(blocks) {
			let out = "";
			for (const block of blocks) if (block.kind === "text") out += block.text;
			return out;
		}

		/** Turn plain text into a Markdown blockquote. */
		function toBlockquote(text) {
			return text.split(/\r?\n/).map((line) => line === "" ? ">" : "> " + line).join("\n");
		}

		/** Lucide `quote` glyph (ISC license), 24x24 viewBox scaled to 16px. */
		const QUOTE_PATHS = [
			"M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z",
			"M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"
		];
		const QUOTE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + QUOTE_PATHS[0] + '"/><path d="' + QUOTE_PATHS[1] + '"/></svg>';

		function QuoteGlyph() {
			return react_jsx_runtime.jsxs("svg", {
				width: 16,
				height: 16,
				viewBox: "0 0 24 24",
				fill: "currentColor",
				"aria-hidden": true,
				children: [
					react_jsx_runtime.jsx("path", { d: QUOTE_PATHS[0] }),
					react_jsx_runtime.jsx("path", { d: QUOTE_PATHS[1] })
				]
			});
		}

		// ── floating selection toolbar (module-level, shared by all messages) ──

		let quoteApplicator = null; // set by the most recently mounted message component
		let pendingQuote = "";
		let quoteToolbar = null;
		let lastMouse = null; // {x, y} of the last mouseup (selection release point)

		function ensureToolbar() {
			if (quoteToolbar !== null) return quoteToolbar;
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "dsh-quote-reply-float";
			btn.innerHTML = QUOTE_SVG;
			// Keep the selection alive across the toolbar click.
			btn.addEventListener("mousedown", (event) => event.preventDefault());
			btn.addEventListener("click", () => {
				const text = pendingQuote;
				hideToolbar();
				// Clear the page selection after applying, like the action-row button.
				try {
					window.getSelection?.()?.removeAllRanges();
				} catch (_) {}
				if (text !== "" && quoteApplicator !== null) quoteApplicator(text);
			});
			document.body.appendChild(btn);
			quoteToolbar = btn;
			return btn;
		}

		function hideToolbar() {
			pendingQuote = "";
			if (quoteToolbar !== null) quoteToolbar.style.display = "none";
		}

		/**
		 * Is the spot the button currently occupies visually free? The button is
		 * kept at pointer-events:none during probing, so `elementFromPoint`
		 * reports the topmost element BENEATH it: free = chat content / empty
		 * page background; blocked = foreign overlays (extension toolbars,
		 * menus, modals, tooltips).
		 */
		function isSpotFree(btn) {
			const rect = btn.getBoundingClientRect();
			const cx = Math.round(rect.left + rect.width / 2);
			const cy = Math.round(rect.top + rect.height / 2);
			const vw = window.innerWidth || 0;
			const vh = window.innerHeight || 0;
			if (cx < 0 || cy < 0 || cx > vw || cy > vh) return false;
			const top = document.elementFromPoint(cx, cy);
			if (top === null) return false;
			if (top === btn || btn.contains(top)) return true;
			if (top === document.body || top === document.documentElement) return true;
			return typeof top.closest === "function" && top.closest('[data-chat-flow], [data-conversation-scroll]') !== null;
		}

		/**
		 * Show the floating button at the first candidate spot that is not
		 * occupied by another overlay (tried in order; clamped to the viewport;
		 * the last candidate wins when everything is blocked, so the button
		 * never disappears).
		 */
		function showToolbarNear(candidates) {
			const btn = ensureToolbar();
			btn.style.display = "inline-flex";
			btn.style.pointerEvents = "none"; // do not intercept the occupancy probe
			const w = btn.offsetWidth || 28;
			const h = btn.offsetHeight || 28;
			const vw = window.innerWidth || 0;
			const vh = window.innerHeight || 0;
			for (const cand of candidates) {
				const x = Math.max(4, Math.min(cand.x, vw - w - 4));
				const y = Math.max(4, Math.min(cand.y, vh - h - 4));
				btn.style.left = x + "px";
				btn.style.top = y + "px";
				if (isSpotFree(btn)) {
					btn.style.pointerEvents = "";
					return;
				}
			}
			btn.style.pointerEvents = "";
		}

		function onSelectionMaybe() {
			if (quoteApplicator === null) {
				hideToolbar();
				return;
			}
			const sel = window.getSelection ? window.getSelection() : null;
			const text = sel !== null && !sel.isCollapsed ? String(sel).trim() : "";
			if (text === "" || sel.rangeCount === 0) {
				hideToolbar();
				return;
			}
			const range = sel.getRangeAt(0);
			// Only quote selections made inside the chat message area — never
			// sidebar/settings/tool-panel text.
			const anchor = range?.commonAncestorContainer;
			const el = anchor?.nodeType === 3 ? anchor.parentElement : anchor;
			const inside = el !== null && el !== void 0 && typeof el.closest === "function" && el.closest('[data-chat-flow]') !== null;
			if (!inside) {
				hideToolbar();
				return;
			}
			pendingQuote = text;
			const bounds = range.getBoundingClientRect();
			const tail = range.cloneRange();
			tail.collapse(false); // point right after the last selected character
			const end = tail.getBoundingClientRect();
			const btn = ensureToolbar();
			const w = btn.offsetWidth || 28;
			const h = btn.offsetHeight || 28;
			const candidates = [];
			// Anchor near the mouse when it is close to the selection (mouse
			// selections end at the release point); otherwise fall back to the
			// selection end (keyboard selections).
			const m = lastMouse;
			const nearMouse = m !== null && m.x >= bounds.left - 140 && m.x <= bounds.right + 140 && m.y >= bounds.top - 140 && m.y <= bounds.bottom + 140;
			if (nearMouse) {
				candidates.push(
					{ x: m.x + 8, y: m.y - h / 2 }, // right of the mouse
					{ x: m.x + 8, y: m.y + 8 }, // below-right
					{ x: m.x - 8 - w, y: m.y - h / 2 }, // left of the mouse
					{ x: m.x + 8, y: m.y - 8 - h }, // above-right
					{ x: m.x - w / 2, y: m.y - 8 - h }, // above
					{ x: m.x - w / 2, y: m.y + 8 } // below
				);
			}
			candidates.push(
				{ x: end.left - w / 2, y: end.top - h - 6 }, // above the selection end
				{ x: end.left - w / 2, y: end.bottom + 6 } // below the selection end
			);
			showToolbarNear(candidates);
		}

		/** Escape dismisses the toolbar and clears the selection. */
		function onKeyDown(event) {
			if (event.key !== "Escape") return;
			try {
				window.getSelection?.()?.removeAllRanges();
			} catch (_) {}
			hideToolbar();
		}

		/** Append a blockquote to the draft and focus the composer textarea. */
		function focusComposer() {
			if (typeof document === "undefined") return;
			const textarea = document.querySelector('[data-composer-card] textarea');
			if (textarea === null) return;
			textarea.focus();
			setTimeout(() => {
				try {
					const end = textarea.value.length;
					textarea.setSelectionRange(end, end);
				} catch (_) {}
			}, 0);
		}

		if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="dsh-quote-reply/action.css"]') === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-quote-reply";
			tag.dataset.pluginCss = "dsh-quote-reply/action.css";
			tag.textContent = ".dsh-quote-reply-action{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}.dsh-quote-reply-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.dsh-quote-reply-float{position:fixed;z-index:1000;display:none;width:28px;height:28px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-secondary);border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.2);cursor:pointer;justify-content:center;align-items:center;padding:4px}.dsh-quote-reply-float:hover{background:var(--dsw-alias-interactive-bg-hover)}";
			document.head.appendChild(tag);
		}

		/**
		 * One closing assistant message's quote action (standard kit props:
		 * useSession / useInput / inputActions plus the owner's messageId and
		 * the locale `t` bound to this entry's namespace).
		 */
		function QuoteReplyAction({ messageId, t, useSession, useInput, inputActions }) {
			const wholeText = useSession((snapshot) => {
				for (const node of snapshot.chat.nodes.values()) {
					const finalNode = node?.data?.finalNode;
					if (finalNode !== void 0 && finalNode.messageId === messageId) {
						return textOfBlocks(finalNode.blocks);
					}
				}
				return "";
			});
			const draft = useInput((state) => state.draft);
			const selectionRef = react.useRef("");
			const draftRef = react.useRef(draft);
			draftRef.current = draft;

			// Serve as the floating toolbar's applicator while this message is mounted.
			react.useEffect(() => {
				if (typeof document === "undefined") return;
				const toolbar = ensureToolbar();
				toolbar.setAttribute("title", t("action.quoteSelected"));
				toolbar.setAttribute("aria-label", t("action.quoteSelected"));
				const previous = quoteApplicator;
				quoteApplicator = (text) => {
					const quote = toBlockquote(text);
					const current = draftRef.current;
					const next = current.trim() === "" ? quote : current.replace(/\s+$/, "") + "\n\n" + quote;
					inputActions.setDraft(next);
					focusComposer();
				};
				return () => {
					quoteApplicator = previous;
				};
			}, [inputActions, t]);

			const onMouseDown = (event) => {
				const selected = window.getSelection ? String(window.getSelection()).trim() : "";
				selectionRef.current = selected;
				// Keep the selection alive through the click (focus would clear it).
				if (selected !== "") event.preventDefault();
			};

			const onQuote = () => {
				const selected = selectionRef.current;
				selectionRef.current = "";
				// Drop the page selection so the next quote cannot re-quote stale text.
				try {
					window.getSelection?.()?.removeAllRanges();
				} catch (_) {}
				const source = (selected !== "" ? selected : wholeText).trim();
				if (source === "") return;
				const quote = toBlockquote(source);
				const next = draft.trim() === "" ? quote : draft.replace(/\s+$/, "") + "\n\n" + quote;
				inputActions.setDraft(next);
				focusComposer();
			};

			return react_jsx_runtime.jsx("button", {
				type: "button",
				className: "dsh-quote-reply-action",
				title: t("action.quote"),
				"aria-label": t("action.quote"),
				onMouseDown,
				onClick: onQuote,
				children: react_jsx_runtime.jsx(QuoteGlyph, {})
			});
		}

		/** Required services: the slot registry and the locale face. */
		const inject = ["slots", "locale"];

		/** Client plugin body: the quote entry in conversation.chat.assistant-actions. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-quote-reply: dictionaries");
			ctx.effect(() => {
				if (typeof document === "undefined") return;
				let timer = 0;
				const schedule = () => {
					if (timer !== 0) clearTimeout(timer);
					timer = setTimeout(onSelectionMaybe, 30);
				};
				const onMouseUp = (event) => {
					lastMouse = { x: event.clientX, y: event.clientY };
					schedule();
				};
				document.addEventListener("mouseup", onMouseUp);
				document.addEventListener("selectionchange", schedule);
				document.addEventListener("scroll", hideToolbar, true);
				document.addEventListener("keydown", onKeyDown);
				return () => {
					if (timer !== 0) clearTimeout(timer);
					document.removeEventListener("mouseup", onMouseUp);
					document.removeEventListener("selectionchange", schedule);
					document.removeEventListener("scroll", hideToolbar, true);
					document.removeEventListener("keydown", onKeyDown);
					hideToolbar();
				};
			}, "dsh-quote-reply: selection watcher");
			ctx.slots.inject("conversation.chat.assistant-actions", () => {
				const dispose = ctx.slots.register({
					name: "conversation.chat.assistant-actions",
					id: "quote-reply",
					order: 5,
					locale: NS
				}, QuoteReplyAction);
				return () => {
					dispose();
				};
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
