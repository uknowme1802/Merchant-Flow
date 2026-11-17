// Keeps docs/openapi.yaml honest: it must be internally consistent and must not promise
// error codes the API never sends.

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const root = path.join(__dirname, "..");
const specText = fs.readFileSync(path.join(root, "docs", "openapi.yaml"), "utf8");
const spec = YAML.parse(specText);

const sourceText = ["services", "controllers", "middleware", "routes"]
    .flatMap((dir) => fs.readdirSync(path.join(root, dir)).map((f) => path.join(root, dir, f)))
    .filter((f) => f.endsWith(".js"))
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");

describe("openapi.yaml", () => {
    test("every $ref points at something that exists", () => {
        const missing = [];
        const walk = (node, where) => {
            if (!node || typeof node !== "object") return;
            for (const [key, value] of Object.entries(node)) {
                if (key === "$ref" && typeof value === "string") {
                    const target = value.replace(/^#\//, "").split("/").reduce((cur, part) => cur?.[part], spec);
                    if (target === undefined) missing.push(`${value} (in ${where})`);
                } else {
                    walk(value, `${where}/${key}`);
                }
            }
        };
        walk(spec, "");
        expect(missing).toEqual([]);
    });

    test("every tag used by an operation is declared", () => {
        const declared = new Set(spec.tags.map((t) => t.name));
        const used = new Set();
        for (const ops of Object.values(spec.paths)) {
            for (const op of Object.values(ops)) (op.tags || []).forEach((t) => used.add(t));
        }
        expect([...used].filter((t) => !declared.has(t))).toEqual([]);
    });

    test("documents the Phase 2a endpoints", () => {
        expect(Object.keys(spec.paths["/v1/orders"])).toEqual(["post"]);
        expect(Object.keys(spec.paths["/v1/orders/{orderId}"])).toEqual(["get"]);
        expect(Object.keys(spec.paths["/api/pay/{orderId}"])).toEqual(["get"]);
        expect(Object.keys(spec.paths["/api/pay/{orderId}/claim"])).toEqual(["post"]);
        expect(Object.keys(spec.paths["/api/admin/bank-credits"]).sort()).toEqual(["get", "post"]);
    });

    test("the signed order endpoints require a signature and the public ones require nothing", () => {
        for (const p of ["/v1/orders", "/v1/orders/{orderId}"]) {
            const op = Object.values(spec.paths[p])[0];
            expect(op.security).toEqual([{ merchantSignature: [] }]);
        }
        for (const p of ["/api/pay/{orderId}", "/api/pay/{orderId}/claim"]) {
            const op = Object.values(spec.paths[p])[0];
            expect(op.security).toEqual([]);
        }
    });

    test("every error code named in the docs is sent by the API", () => {
        // Codes appear in the spec as `SOME_CODE` in backticks.
        const documented = new Set([...specText.matchAll(/`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)`/g)].map((m) => m[1]));
        // Words in backticks that are not error codes (HTTP-style constants used in prose).
        const notCodes = new Set(["METRICS_TOKEN"]);
        const unknown = [...documented].filter((code) => !notCodes.has(code) && !sourceText.includes(`"${code}"`));
        expect(unknown).toEqual([]);
        expect(documented.has("NO_BANK_AVAILABLE")).toBe(true);
    });
});
