/**
 * Durable identifier generation — H5, decisions **M1** and **M9**.
 *
 * The identifier a surrogate entity carries is `${prefix}-${ULID}`: a 48-bit
 * millisecond timestamp followed by an 80-bit component, both in Crockford
 * base32, fixed width, so the string sorts lexicographically in mint order.
 *
 * ## Why this exists
 *
 * `counterIdGenerator` counts from zero in process memory. A restart resets the
 * counter while the database keeps every row, so the first write after a restart
 * re-mints an identifier that already exists and fails — **any** write, not just
 * a duplicate one (limitation **78**). Two application instances collide for the
 * same reason: both count from zero.
 *
 * The fix is not a better counter. It is **not counting**: nothing is remembered
 * between processes, so nothing can be forgotten.
 *
 * ## The state here is ORDERING state, never uniqueness state (M9)
 *
 * `lastMs` and `lastRandom` exist so that identifiers minted inside one
 * millisecond sort in mint order. Losing them costs ordering within that
 * millisecond and nothing else — which is exactly how this differs from
 * `counterIdGenerator`, whose state *was* load-bearing for uniqueness. That was
 * the defect.
 *
 * Uniqueness is supplied by the **primary key**, not by this function. A repeated
 * identifier could only ever cause a loud, failed write; it can never produce a
 * duplicate row, a mis-resolved anchor or an affected signature.
 *
 * ## Purity
 *
 * `@asdp/domain` is a pure package: no clock, no randomness. Both are therefore
 * **injected**, which also makes the generator deterministic under test — the
 * same clock and the same entropy produce the same identifiers.
 */

/** Crockford base32, excluding I, L, O and U so an id cannot be misread aloud. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 10 characters × 5 bits = 50 bits, comfortably above the 48 a timestamp needs. */
const TIMESTAMP_LENGTH = 10;
/** 16 characters × 5 bits = 80 bits. */
const RANDOM_LENGTH = 16;
const RANDOM_BYTES = 10;

/** The largest millisecond a 10-character base32 timestamp can hold. */
export const MAX_ULID_TIMESTAMP = 32 ** TIMESTAMP_LENGTH - 1;

export interface IdentityClock {
  nowIso(): string;
}

/** Injected entropy. `node:crypto`'s `randomBytes` satisfies it. */
export type RandomSource = (size: number) => Uint8Array;

export interface DurableIdGenerator {
  next(prefix: string): string;
}

/** Fixed-width base32 for the timestamp half. */
function encodeTimestamp(ms: number): string {
  let remaining = ms;
  let out = '';
  for (let i = TIMESTAMP_LENGTH - 1; i >= 0; i--) {
    out = ALPHABET[remaining % 32] + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}

/** Fixed-width base32 for the 80-bit half. */
function encodeRandom(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out.slice(0, RANDOM_LENGTH).padEnd(RANDOM_LENGTH, ALPHABET[0]);
}

/**
 * Increment the 80-bit component by one, in place of drawing fresh randomness.
 *
 * This is what makes two identifiers minted in the same millisecond sort in mint
 * order. Redrawing instead would order them arbitrarily — and adjacent audit
 * events share a millisecond in the overwhelming majority of writes, so the
 * arbitrary case is the normal one, not an edge case.
 */
function increment(bytes: Uint8Array): Uint8Array {
  const next = Uint8Array.from(bytes);
  for (let i = next.length - 1; i >= 0; i--) {
    const byte = next[i] as number;
    if (byte !== 0xff) {
      next[i] = byte + 1;
      return next;
    }
    next[i] = 0;
  }
  // 2^80 identifiers inside one millisecond. Throwing is correct: wrapping would
  // silently re-mint an identifier already handed out in this millisecond.
  throw new Error(
    'identifier randomness exhausted within a single millisecond (2^80 ids); refusing to wrap',
  );
}

/**
 * A generator whose identifiers survive a restart and do not collide between
 * instances (**M1**).
 *
 * @param clock  injected, so the package stays pure and tests stay deterministic
 * @param random injected entropy; production passes `node:crypto`'s `randomBytes`
 */
export function durableIdGenerator(
  clock: IdentityClock,
  random: RandomSource,
): DurableIdGenerator {
  let lastMs = -1;
  let lastRandom: Uint8Array = new Uint8Array(RANDOM_BYTES);

  return {
    next(prefix: string): string {
      if (prefix.length === 0) throw new Error('an identifier prefix may not be empty');

      const observed = Date.parse(clock.nowIso());
      if (!Number.isFinite(observed)) {
        throw new Error(`clock returned an unparseable time: ${clock.nowIso()}`);
      }
      if (observed > MAX_ULID_TIMESTAMP) {
        throw new Error(`time ${observed} exceeds what a 10-character ULID timestamp can hold`);
      }

      // The clamp. A clock correction may move time backwards; an identifier
      // minted later must never sort earlier than one minted before it, so the
      // observed time is floored at the last one used. Ordering is preserved by
      // falling through to the increment path below.
      const effective = observed > lastMs ? observed : lastMs;

      if (effective === lastMs) {
        lastRandom = increment(lastRandom);
      } else {
        lastMs = effective;
        lastRandom = Uint8Array.from(random(RANDOM_BYTES));
        if (lastRandom.length !== RANDOM_BYTES) {
          throw new Error(`entropy source returned ${lastRandom.length} bytes, expected ${RANDOM_BYTES}`);
        }
      }

      return `${prefix}-${encodeTimestamp(effective)}${encodeRandom(lastRandom)}`;
    },
  };
}
