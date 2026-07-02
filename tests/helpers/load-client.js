// Loads browser scripts (docs/js/*.js) into a Node vm sandbox for testing.
// The client files are plain scripts that attach globals to `window` — no DOM
// library needed as long as we stub the handful of browser APIs they touch.
import fs from "fs";
import path from "path";
import vm from "vm";

const docsJs = path.resolve(process.cwd(), "docs", "js");

export function createClientSandbox() {
	const sandbox = {
		console,
		Date,
		Math,
		JSON,
		Promise,
		setTimeout,
		clearTimeout,
		setInterval,
		clearInterval,
		Object,
		Array,
		Map,
		Set,
		parseInt,
		parseFloat,
		isNaN,
		matchMedia: () => ({ matches: false }),
		localStorage: (() => {
			const store = new Map();
			return {
				getItem: (k) => (store.has(k) ? store.get(k) : null),
				setItem: (k, v) => store.set(k, String(v)),
				removeItem: (k) => store.delete(k),
			};
		})(),
		document: {
			hidden: false,
			addEventListener: () => {},
			getElementById: () => null,
			querySelector: () => null,
			createElement: () => ({ addEventListener: () => {}, remove: () => {}, set innerHTML(v) {}, dataset: {}, classList: { add() {} } }),
			body: { addEventListener: () => {}, appendChild: () => {} },
			documentElement: { dataset: {} },
		},
		fetch: () => Promise.resolve({ ok: false }),
	};
	sandbox.window = sandbox;
	sandbox.globalThis = sandbox;
	vm.createContext(sandbox);
	return sandbox;
}

export function loadClientScript(sandbox, filename) {
	const code = fs.readFileSync(path.join(docsJs, filename), "utf-8");
	vm.runInContext(code, sandbox, { filename });
	return sandbox;
}
