// Tiny, dependency-free JSON-Schema validator. Supports exactly the keywords our
// schemas use: type, required, properties, additionalProperties:false, items,
// enum, minimum, pattern, anyOf, and local $ref (#/definitions/x). Returns error
// strings. (`pattern` arrived with WP-185, which needs real teeth on the
// registry's ISO country code and `#rrggbb` colour fields — an enum can't express
// "any ISO alpha-2", and without it the schema would document a shape it could
// not enforce.)
// Kept minimal on purpose — the project stays zero-dependency. Both the CI test and
// the follow-request applier validate against the SAME schema through this.

export function validateAgainstSchema(data, node, root = node, at = "") {
	const errors = [];
	if (!node || typeof node !== "object") return errors;

	if (node.$ref) {
		const target = node.$ref.replace(/^#\//, "").split("/").reduce((o, k) => o?.[k], root);
		return validateAgainstSchema(data, target, root, at);
	}
	if (node.anyOf) {
		if (!node.anyOf.some((s) => validateAgainstSchema(data, s, root, at).length === 0)) {
			errors.push(`${at || "(root)"}: matches none of the allowed shapes`);
		}
		return errors;
	}
	if (node.type) {
		const t = node.type;
		const ok =
			(t === "object" && data && typeof data === "object" && !Array.isArray(data)) ||
			(t === "array" && Array.isArray(data)) ||
			(t === "string" && typeof data === "string") ||
			(t === "integer" && Number.isInteger(data)) ||
			(t === "number" && typeof data === "number") ||
			(t === "boolean" && typeof data === "boolean");
		if (!ok) { errors.push(`${at || "(root)"}: expected ${t}`); return errors; }
	}
	if (node.enum && !node.enum.includes(data)) errors.push(`${at}: "${data}" not allowed`);
	if (node.pattern && typeof data === "string" && !new RegExp(node.pattern).test(data)) {
		errors.push(`${at}: "${data}" does not match ${node.pattern}`);
	}
	if (typeof node.minimum === "number" && typeof data === "number" && data < node.minimum) {
		errors.push(`${at}: ${data} below minimum ${node.minimum}`);
	}
	if (node.type === "object" && data && typeof data === "object" && !Array.isArray(data)) {
		for (const req of node.required || []) if (!(req in data)) errors.push(`${at}: missing "${req}"`);
		for (const key of Object.keys(data)) {
			if (node.properties?.[key]) errors.push(...validateAgainstSchema(data[key], node.properties[key], root, `${at}.${key}`));
			else if (node.additionalProperties === false) errors.push(`${at}: unexpected property "${key}"`);
		}
	}
	if (node.type === "array" && Array.isArray(data) && node.items) {
		data.forEach((item, i) => errors.push(...validateAgainstSchema(item, node.items, root, `${at}[${i}]`)));
	}
	return errors;
}
