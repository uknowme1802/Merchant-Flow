const dns = require("dns").promises;
const net = require("net");

// Webhook URLs are admin-supplied, so without a guard they could point the server at internal
// services (cloud metadata at 169.254.169.254, localhost admin ports, private networks).
// Set WEBHOOK_ALLOW_PRIVATE=true only for local development against a receiver on localhost.

const toInt = (octets) => octets.reduce((acc, o) => acc * 256 + Number(o), 0);

const V4_BLOCKS = [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
    ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
    ["224.0.0.0", 4], ["240.0.0.0", 4]
].map(([base, bits]) => ({ start: toInt(base.split(".")), size: 2 ** (32 - bits) }));

const isPrivateAddress = (ip) => {
    if (net.isIPv4(ip)) {
        const n = toInt(ip.split("."));
        return V4_BLOCKS.some((b) => n >= b.start && n < b.start + b.size);
    }
    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        if (lower === "::" || lower === "::1") return true;
        if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7)); // IPv4-mapped
        return /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith("ff"); // ULA, link-local, multicast
    }
    return true; // not a valid IP: treat as unsafe
};

// Resolves the hostname and rejects if ANY address is private. Throws an Error with .status = 400.
const assertPublicUrl = async (rawUrl) => {
    if (process.env.WEBHOOK_ALLOW_PRIVATE === "true" || process.env.NODE_ENV === "test") return;

    const { hostname } = new URL(rawUrl);
    const host = hostname.replace(/^\[|\]$/g, "");
    const addresses = net.isIP(host)
        ? [{ address: host }]
        : await dns.lookup(host, { all: true }).catch(() => {
            throw Object.assign(new Error("Webhook URL host could not be resolved"), { status: 400 });
        });

    if (addresses.some((a) => isPrivateAddress(a.address))) {
        throw Object.assign(new Error("Webhook URL must point to a public address"), { status: 400 });
    }
};

module.exports = { assertPublicUrl, isPrivateAddress };
