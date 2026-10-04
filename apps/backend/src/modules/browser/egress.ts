import { lookup as dnsLookup } from 'dns/promises';
import { isIP } from 'net';
import ipaddr from 'ipaddr.js';

/**
 * Where the Browser's relay may connect (brief 50) — the OPPOSITE stance from
 * the REST client's (brief 43), on purpose.
 *
 * The REST client fires only URLs the owner typed, so it may reach the LAN.
 * The relay carries traffic for arbitrary third-party pages whose own scripts
 * drive it: one hostile page would otherwise turn it into a scanner of the
 * machine's own network, the Docker bridge and the cloud metadata service. So
 * here only public unicast addresses on web ports are reachable.
 *
 * The check runs on the ADDRESS, after resolution, and the socket then
 * connects to exactly the address that was checked. There is no second
 * lookup, so a DNS answer cannot change between the check and the connect
 * (rebinding), and a hostname that resolves to a private address is refused
 * like the address itself.
 */

/** The ports a page may reach. Web traffic only: no SMTP, no SSH, no databases. */
export const ALLOWED_PORTS: ReadonlySet<number> = new Set([
  80, 443, 8080, 8443,
]);

export class EgressRefusedError extends Error {
  override readonly name = 'EgressRefusedError';
}

/**
 * True only for a public unicast address.
 *
 * An allow-list, not a block-list: ipaddr.js names every special range
 * (loopback, private, linkLocal, carrierGradeNat, uniqueLocal, multicast,
 * reserved, the IPv6 transition ranges that embed an IPv4 address, …) and only
 * `unicast` is left. IPv4-mapped IPv6 (`::ffff:127.0.0.1`) is unwrapped first,
 * so it is judged as the IPv4 address it is.
 */
export function isPublicAddress(address: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.process(address);
  } catch {
    return false;
  }
  if (parsed.range() !== 'unicast') return false;
  if (parsed.kind() === 'ipv6') {
    // The deprecated IPv4-compatible block, ::/96 (`::7f00:1` is ::127.0.0.1).
    // ipaddr.js calls it unicast.
    const parts = (parsed as ipaddr.IPv6).parts;
    if (parts.slice(0, 6).every((p) => p === 0)) return false;
  }
  return true;
}

export interface ResolvedTarget {
  address: string;
  family: 4 | 6;
}

type Lookup = (host: string) => Promise<{ address: string; family: number }[]>;

const systemLookup: Lookup = (host) =>
  dnsLookup(host, { all: true, verbatim: true });

/**
 * Resolve a stream's destination and decide on it.
 *
 * Every answer must be public, not just the first: a name answering with one
 * public and one private address is refused outright, so which one the
 * resolver happens to put first cannot matter.
 */
export async function resolvePublicTarget(
  hostname: string,
  port: number,
  lookup: Lookup = systemLookup,
): Promise<ResolvedTarget> {
  if (!ALLOWED_PORTS.has(port)) {
    throw new EgressRefusedError(`port ${port} is not a web port`);
  }
  // A bracketed IPv6 literal arrives with its brackets from some clients.
  const host = hostname.trim().replace(/^\[(.*)\]$/, '$1');
  if (host === '') throw new EgressRefusedError('no destination');

  let answers: { address: string; family: number }[];
  if (isIP(host)) {
    answers = [{ address: host, family: isIP(host) }];
  } else {
    try {
      answers = await lookup(host);
    } catch {
      throw new EgressRefusedError(`${host} does not resolve`);
    }
  }
  if (answers.length === 0) {
    throw new EgressRefusedError(`${host} does not resolve`);
  }
  for (const answer of answers) {
    if (!isPublicAddress(answer.address)) {
      throw new EgressRefusedError(`${host} resolves to a non-public address`);
    }
  }
  const first = answers[0];
  return { address: first.address, family: first.family === 6 ? 6 : 4 };
}
