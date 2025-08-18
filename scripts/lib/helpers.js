import fs from "fs";
import path from "path";
import https from "https";

export function iso(d = Date.now()) {
	return new Date(d).toISOString();
}

export async function fetchJson(
	url,
	{ headers = {}, retries = 2, retryDelay = 500 } = {}
) {
	headers["User-Agent"] = headers["User-Agent"] || "SportSync/1.0";
	return new Promise((resolve, reject) => {
		https
			.get(url, { headers }, (res) => {
				let body = "";
				res.on("data", (c) => (body += c));
				res.on("end", async () => {
					if (res.statusCode && res.statusCode >= 500 && retries > 0) {
						await new Promise((r) => setTimeout(r, retryDelay));
						try {
							resolve(
								await fetchJson(url, {
									headers,
									retries: retries - 1,
									retryDelay: retryDelay * 2,
								})
							);
						} catch (e) {
							reject(e);
		function retryFetchJson() {
			setTimeout(async () => {
				try {
					resolve(
						await fetchJson(url, {
							headers,
							retries: retries - 1,
							retryDelay: retryDelay * 2,
						})
					);
				} catch (e) {
					reject(e);
				}
			}, retryDelay);
		}
		https
			.get(url, { headers }, (res) => {
				let body = "";
				res.on("data", (c) => (body += c));
				res.on("end", async () => {
					if (res.statusCode && res.statusCode >= 500 && retries > 0) {
						retryFetchJson();
						return;
					}
					try {
						resolve(JSON.parse(body));
					} catch (e) {
						reject(e);
					}
				});
			})
			.on("error", async (err) => {
				if (retries > 0) {
					await new Promise((r) => setTimeout(r, retryDelay));
					try {
						resolve(
							await fetchJson(url, {
								headers,
								retries: retries - 1,
								retryDelay: retryDelay * 2,
							})
						);
					} catch (e) {
						reject(e);
					}
				} else reject(err);
			});
	});
}

export function readJsonIfExists(file) {
	try {
		return JSON.parse(fs.readFileSync(file, "utf-8"));
	} catch {
		return null;
	}
}

export function writeJsonPretty(file, data) {
	fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function retainLastGood(targetFile, newData) {
	const exists = readJsonIfExists(targetFile);
	const newHasEvents = hasEvents(newData);
	if (!newHasEvents && exists && hasEvents(exists)) {
		return { kept: true, data: exists };
	}
	writeJsonPretty(targetFile, newData);
	return { kept: false, data: newData };
}

export function hasEvents(obj) {
	if (!obj) return false;
	if (Array.isArray(obj.tournaments)) {
		return obj.tournaments.some(
			(t) => Array.isArray(t.events) && t.events.length > 0
		);
	}
	return false;
}

export function mergePrimaryAndOpen(primary, open) {
	if (!primary || !hasEvents(primary)) return open || primary;
	if (!open || !hasEvents(open)) return primary;
	const map = new Map(primary.tournaments.map((t) => [t.name, t]));
	for (const t of open.tournaments) {
		if (!map.has(t.name) || !hasEvents(map.get(t.name))) {
			map.set(t.name, t);
		}
	}
	return { ...primary, tournaments: Array.from(map.values()) };
}

export function rootDataPath() {
	return path.resolve(process.cwd(), "docs", "data");
}

export function summaryLine(label, value) {
	return `- **${label}**: ${value}`;
}

export function countEvents(obj) {
	if (!obj || !Array.isArray(obj.tournaments)) return 0;
	return obj.tournaments.reduce((acc, t) => acc + (t.events?.length || 0), 0);
}
