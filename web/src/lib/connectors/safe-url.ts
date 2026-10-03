import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// SSRF guard for user-supplied URLs (Fetch URL) and search results: the server must never be steered
// into fetching loopback, private-network or cloud-metadata addresses.
// Known limit: DNS can change between this check and the fetch (rebinding); pinning the resolved IP
// would need a custom HTTP agent.

export class UnsafeUrlError extends Error {}

function v4ToInt(ip: string) {
  return ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function blockedV4(ip: string) {
  const n = v4ToInt(ip);
  return V4_BLOCKS.some(([base, bits]) => (n >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits)));
}

function blockedV6(ip: string) {
  const a = ip.toLowerCase();
  const mapped = a.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped/-compatible, dotted
  if (mapped) return blockedV4(mapped[1]);
  // the URL parser normalizes [::ffff:127.0.0.1] to hex ([::ffff:7f00:1]); decode that form too
  const hex = a.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const [hi, lo] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
    return blockedV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return a === "::" || a === "::1" || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || /^ff/.test(a); // unspecified, loopback, ULA, link-local, multicast
}

export function isBlockedAddress(ip: string) {
  return isIP(ip) === 4 ? blockedV4(ip) : isIP(ip) === 6 ? blockedV6(ip) : true;
}

/** Throws UnsafeUrlError unless `raw` is http(s) and every address its host resolves to is public. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError(`Not a valid URL: ${raw.slice(0, 80)}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new UnsafeUrlError(`Only http(s) links are allowed: ${u.protocol}`);
  if (u.username || u.password) throw new UnsafeUrlError("Links with embedded credentials are not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$|\.(localhost|local|internal|home\.arpa)$/i.test(host)) throw new UnsafeUrlError(`Internal host not allowed: ${host}`);
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true }).catch(() => [])).map((a) => a.address);
  if (!addrs.length) throw new UnsafeUrlError(`Could not resolve ${host}`);
  if (addrs.some(isBlockedAddress)) throw new UnsafeUrlError(`Private or internal address not allowed: ${host}`);
  return u;
}
