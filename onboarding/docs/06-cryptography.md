---
sidebar_position: 6
title: "Cryptography (non-ZK)"
description: "The cryptographic primitives outside the zero-knowledge stack: hashes, BLAKE2 personalisation, Equihash, signatures (secp256k1, Ed25519, RedJubjub, RedPallas), AEAD."
---

# Cryptography (non-ZK)

## 1. Why this chapter exists

The cryptographic primitives outside the zero-knowledge stack are
spread across two languages and a dozen files. A reader who does not
know where they live will reinvent BLAKE2 personalisation, or worse,
add a primitive in C++ that already exists in Rust. This chapter
draws the map and states the formal contract each primitive provides.

The zero-knowledge stack (Groth16, Halo 2, the shielded protocols)
is the subject of [chapter 07](./07-zk-proofs-and-pools.md).

## 2. Definitions

**Definition 6.1 (Cryptographic hash).** A function
$H : \{0,1\}^* \to \{0,1\}^\ell$ is a cryptographic hash if it is
collision-resistant, preimage-resistant, and second-preimage-resistant
in the random-oracle model. In Zcash, the family is
$\{\mathsf{SHA256}, \mathsf{SHA512}, \mathsf{RIPEMD160},
\mathsf{BLAKE2b}, \mathsf{BLAKE2s}\}$.

**Definition 6.2 (Personalised BLAKE2b).** The function
$\mathsf{BLAKE2b}\text{-}\ell(\mathsf{pers}, x) =
\mathsf{BLAKE2b}\langle\text{output length}=\ell, \text{personalisation}=\mathsf{pers}\rangle(x)$.
The personalisation string $\mathsf{pers} \in \{0,1\}^{128}$ is a
domain separator. Two BLAKE2b instances with different
$\mathsf{pers}$ cannot collide even on the same input bytes.

**Invariant 6.3 (Personalisation discipline).** Every BLAKE2b call
in Zcash uses a personalisation string drawn from a small,
spec-mandated set. A change to a personalisation string is a
consensus-breaking change.

**Definition 6.4 (EUF-CMA).** A signature scheme is
existentially unforgeable under chosen-message attack if no
polynomial-time adversary, given access to a signing oracle, can
produce a valid signature on a message they did not query. All
production signature schemes in zcashd target EUF-CMA.

**Definition 6.5 (Equihash $(n, k)$).** The proof-of-work problem
asks for $2^k$ distinct indices $(i_1, \ldots, i_{2^k})$ such that
$\bigoplus_{j=1}^{2^k} H(i_j) = 0^n$ where $H$ is a personalised
BLAKE2b-keyed by the block header (minus the solution). zcashd uses
$(n, k) = (200, 9)$ on mainnet/testnet and $(48, 5)$ on regtest.

**Lemma 6.6 (Equihash asymmetry).** Solving Equihash $(n, k)$
requires $\Theta(2^{n/(k+1)})$ memory; verifying a solution requires
$O(2^k)$ hash computations. The asymmetry makes Equihash ASIC-resistant
(in theory) and cheap to verify (in practice). See
[Biryukov, Khovratovich, NDSS 2016].

## 3. The code

The split between C++ and Rust is approximately:

- **C++ owns**: SHA-2 family, RIPEMD160, HMAC-SHA-2, ChaCha20, AES,
  the Equihash verifier, and the Bitcoin Script signature
  verification (via vendored libsecp256k1).
- **Rust owns**: BLAKE2b, Ed25519 (Zebra-style), the transparent
  ECDSA used by the Rust crates (a separate `secp256k1` crate),
  every elliptic curve used inside zk-SNARKs (BLS12-381, Jubjub,
  Pallas, Vesta), RedDSA / RedJubjub / RedPallas, Pedersen and
  Sinsemilla hashes, Poseidon (where used), the entire shielded-pool
  primitive set.

This duplication is historical: anything that predates
`librustzcash` exists in C++; anything since has been added in Rust.
Where both exist (e.g. SHA-256 and BLAKE2b are reachable from both
sides via FFI), the active path goes through whichever side hosts
the calling subsystem.

### Hashes

#### SHA-256

`src/crypto/sha256.{h,cpp}` plus four ISA-specific accelerated
implementations (`sha256_avx2.cpp`, `sha256_sse4.cpp`,
`sha256_sse41.cpp`, `sha256_shani.cpp`). At startup,
`CSHA256::AutoDetect` selects the best implementation based on
CPUID.

```cpp reference title="src/crypto/sha256.cpp (AutoDetect dispatch)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/crypto/sha256.cpp#L1-L60
```

`CHash256` (in `src/hash.h`) is double-SHA256, used for txid
(pre-NU5), block hash, addr checksums, and many other
Bitcoin-style hashes.

#### SHA-512 and SHA-1

`src/crypto/sha512.{h,cpp}` and `sha1.{h,cpp}`. SHA-512 is used via
HMAC inside BIP-32 derivation (transparent keys). SHA-1 is present
for legacy Bitcoin Script `OP_SHA1`.

#### RIPEMD160

`src/crypto/ripemd160.{h,cpp}`. Used in
$\mathsf{Hash160}(x) = \mathsf{RIPEMD160}(\mathsf{SHA256}(x))$, the
standard Bitcoin address fingerprint.

#### HMAC

`src/crypto/hmac_sha256.{h,cpp}` and `hmac_sha512.{h,cpp}`. Used
for BIP-32 derivation and for any keyed MAC.

#### BLAKE2b and BLAKE2s

`src/rust/src/blake2b.rs` wraps `blake2b_simd` and exposes a small
C++ interface via cxx (header `src/rust/include/rust/blake2b.h`).
BLAKE2s is used internally to the Sapling Rust code.

```rust reference title="src/rust/src/blake2b.rs (personalised BLAKE2b)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/blake2b.rs#L1-L80
```

BLAKE2 is *the* Zcash hash. Zcash uses BLAKE2b with personalisation
strings everywhere; the personalisation discriminates one
cryptographic context from another so that hashes intended for
different purposes can never collide even on the same input bytes.

A non-exhaustive list of personalisations:

```
ZcashPoW           Equihash
ZcashComputehSig   Sprout JoinSplit transcript
Zcash_PHKDF        Sapling note encryption KDF
Zcash_Derive_ock   Sapling outgoing cipher key
Zcash_SaplingHash  Sapling Merkle tree
Zcash_OrchardMH    Orchard Merkle tree
Zcash_UFVK_Id_FP   ZIP-316 UFVK identifier
Zcash_HistoryNode  ZIP-221 history node hash
ZcashTxHash_       a family of NU5 sighash personalisations (ZIP-244)
```

These are defined in protocol-spec sections and reproduced as
constants in `zcash_primitives::constants::*` (Rust) and per-call-site
byte arrays on the C++ side. A wrong personalisation byte is a
consensus-breaking bug.

### Equihash

zcashd verifies the solution in `src/crypto/equihash.{h,cpp,tcc}`.
Mining uses the Tromp solver in `src/pow/tromp/` (only with
`--enable-mining`).

Parameters:

- mainnet/testnet: $(n, k) = (200, 9)$; solution is 1344 bits = 168
  bytes; `equihash_solution_size(200, 9) = 168`.
- regtest: $(n, k) = (48, 5)$.

The Equihash input is BLAKE2b-keyed by the block header (minus the
solution), and the verifier checks that the solution indices XOR to
zero in the expected tree structure and that none of the involved
chunks collide outside the expected positions.

Reading order for Equihash:

1. `src/crypto/equihash.h` for the data layout.
2. `src/crypto/equihash.tcc` (the template) for the algorithm body.
3. `src/pow.cpp::CheckEquihashSolution` for the validation hookup.
4. The Equihash paper for the theory.

### ChaCha20

`src/crypto/chacha20.{h,cpp}` provides a stand-alone ChaCha20 stream
cipher. Used in `src/random.cpp` for the deterministic PRNG and a
few other places.

### AES

`src/crypto/aes.{h,cpp}` wraps `src/crypto/ctaes/`, a constant-time
software AES. Used by the wallet for passphrase-based wallet
encryption (`src/wallet/crypter.cpp`).

### Bowe-Hopwood Pedersen and Sinsemilla (note)

Not in `src/crypto/`. They are Rust-only because they are used
exclusively inside zero-knowledge circuits (Sapling and Orchard
respectively). See [chapter 07](./07-zk-proofs-and-pools.md).

## Symmetric crypto: scope of use

Apart from wallet encryption (AES-256-CBC + HMAC over a
passphrase-derived key) and the in-band note encryption (which uses
ChaCha20-Poly1305 / a Sapling-defined AEAD), zcashd does not encrypt
anything on the wire. All P2P traffic is plaintext. There is no
Noise-protocol handshake (in contrast to recent Bitcoin Core
[BIP 324](https://github.com/bitcoin/bips/blob/master/bip-0324.mediawiki)
work).

## Signature schemes

### secp256k1 ECDSA (transparent)

The vendored `src/secp256k1/` (the original libsecp256k1) provides
ECDSA-over-secp256k1 for transparent transactions. Bitcoin-style
signature serialisation; low-S enforcement; strict DER decoding.
`src/key.cpp` is the C++ wrapper.

Script verification of transparent inputs goes through
`src/script/interpreter.cpp` and ultimately into
`secp256k1_ecdsa_verify`. A signature cache (`src/script/sigcache.cpp`)
speeds up repeated verification.

### Ed25519 (Sprout binding)

Each Sprout JoinSplit is signed with an Ed25519 key whose public key
is committed to in the transaction. zcashd uses the `ed25519-zebra`
crate (see `src/rust/src/ed25519.rs`). The choice of `ed25519-zebra`
was made to enforce
[ZIP-215](https://zips.z.cash/zip-0215) strict verification rules
(no malleability, agreed canonical encoding).

```rust reference title="src/rust/src/ed25519.rs (Sprout binding signature wrapper)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/ed25519.rs#L1-L80
```

### RedJubjub (Sapling)

RedJubjub is the Sapling signature scheme. Two flavours:

- **Spend Authority** signature (over a key derived from $\mathsf{ask}$,
  randomised per-spend by $\alpha$).
- **Binding** signature (a single per-bundle signature over the
  Sapling balance, computed from the value commitments).

Implemented in `zcash_primitives::sapling::redjubjub`. Used through
`src/rust/src/sapling.rs` and called from
`src/main.cpp::ContextualCheckTransaction` (per-spend) and the batch
verifier (per-bundle).

### RedPallas (Orchard)

Same scheme, instantiated over Pallas instead of Jubjub. Lives in the
`orchard` crate. Two flavours: spend authorisation per action and
one binding signature per bundle.

### Schnorr / BIP-340

Not used. Zcash does not have Taproot/Schnorr. The transparent layer
is the original Bitcoin ECDSA.

## Address and key encoding

`src/base58.cpp` and `src/bech32.cpp` are the two encodings. zcashd
uses:

- Base58Check for transparent addresses (`t1...`, `t3...`) and WIF
  private keys.
- Bech32 for Sapling unified payment addresses and viewing keys
  (`zs1...`, `zviews1...`).
- Bech32m for Unified Addresses (ZIP-316), tagged `u1...`.

The HRP (human-readable prefix) is chain-dependent and lives in
`src/key_constants.h` and per-chain in `src/chainparams.cpp`.

For ZIP-316 (unified addresses, viewing keys, FVKs, IVKs), encoding
is NOT simple Bech32 over the receivers list: there is a
per-Receiver type tag, a length-prefix, an obfuscation step
(key-derived F4Jumble permutation) to make the encoded form
non-malleable, and then Bech32m. Read
`src/rust/src/unified_keys_ffi.rs` and the upstream `zcash_address`
crate.

## Randomness

`src/random.{h,cpp}` is the central RNG. `GetRandBytes(n)` is the
canonical "give me cryptographic randomness" call. Underneath:

- On Linux: `getrandom(2)`.
- On macOS: `getentropy(3)`.
- On Windows: `RtlGenRandom`.

Plus an internal `FastRandomContext` for non-cryptographic uses
(`insecure_rand`). Auditing rule: never use `FastRandomContext` where
cryptographic randomness is required. Search for `insecure_rand` and
`FastRandomContext` in any change you review.

## Constant-time concerns

The C++ side does little constant-time-sensitive work directly: that
work is delegated to libsecp256k1 (constant-time) and to Rust (every
Zcash-specific operation goes through `subtle::CtOption` and
friends). When touching C++ that handles secret material:

- No branches or indexing by secret bits.
- `subtle::*` does not exist in C++ here; roll your own
  `ConditionalMove` or use the `support/cleanse.cpp` helpers for
  zeroing.
- The wallet `crypter.cpp` is the most secret-handling C++ in the
  tree and the one to study (and to be paranoid about).

## Memory hygiene for secrets

`src/support/lockedpool.cpp` provides an allocator that `mlock`s
pages holding key material to prevent paging. `src/support/cleanse.cpp`
provides `memory_cleanse`, the volatile-memcpy-with-zero used in
destructors of secret-bearing types. New code that holds secrets
should use these.

In Rust, the `zeroize` and `secrecy` crates serve the same purpose
and are already in the dependency set; use them.

## Cryptographic caches

Two important caches:

- `src/script/sigcache.cpp`: maps
  $(\mathsf{scriptSig}, \mathsf{scriptPubKey}, \mathsf{hashType}, \mathsf{txid})$
  to "this signature was valid". Avoids re-verifying the same ECDSA
  signature when the transaction passes through both mempool and a
  block.
- `src/zcash/cache.cpp`: a proof and signature cache for shielded
  bundles. Same idea: once a Sapling or Orchard proof has been
  verified in any context, do not re-verify it later.

Both caches are bounded in size; their sizing knobs are
operationally relevant for nodes under heavy mempool load.

## 4. Failure modes

- **Wrong BLAKE2b personalisation byte.** Renders every signature
  invalid across the network. Caught by:
  `src/gtest/test_checktransaction.cpp` (for sighashes); for KDF
  personalisations, caught by note-decryption failures only.
- **Using `FastRandomContext` for keying material.** Predictable
  output. Caught by code review only; no automated test.
- **Forgetting to clear secret bytes on drop.** Possible secret
  leakage via swap or core dump. Caught only by audit.
- **Mixing BLAKE2b-256 and BLAKE2b-512 unexpectedly.** Domain
  separation by output length is not enforced; personalisation must
  fix it. Caught by spec-vs-code review.
- **Re-using a sigcache entry across an NU.** Sighash personalisation
  changes; cache key must include the NU. Caught implicitly because
  the cache key includes `hashType`.

## 5. Spec pointers

- [Protocol Specification, section 5 (Cryptographic Primitives)](https://zips.z.cash/protocol/protocol.pdf).
- BLAKE2: Aumasson, Neves, Wilcox-O'Hearn, Winnerlein, 2013.
- Equihash: Biryukov, Khovratovich, NDSS 2016.
- libsecp256k1: the
  [vendored copy](https://github.com/zcash/zcash/tree/v5.5.0-rc1/src/secp256k1)
  has its own README and design notes.
- [ZIP-215](https://zips.z.cash/zip-0215): Explicitly Defining and
  Modifying Ed25519 Validation Rules.
- [ZIP-216](https://zips.z.cash/zip-0216): Required Canonical Jubjub
  Point Encodings.

## 6. Exercises

1. **Personalisation hunt.** Find the BLAKE2b personalisation string
   for the NU5 sighash. Cross-check it against
   [ZIP-244](https://zips.z.cash/zip-0244). Answer is in
   `zcash_primitives::transaction::txid::TxIdDigester` upstream and
   referenced in `src/rust/src/transaction_ffi.rs`.

2. **Hash by hand.** Take a small string ("zcash"), personalise with
   `"ZcashPoW"`, output length 32 bytes; compute by hand using the
   BLAKE2b RFC, then verify against a one-shot call to
   `src/rust/src/blake2b.rs`.

3. **Equihash verify.** Write a Rust test that constructs a regtest
   block, runs the Tromp solver to find a solution, and confirms
   `CheckEquihashSolution` accepts it. Answer skeleton lives in
   `src/gtest/test_pow.cpp`.

4. **Modification exercise.** Add a `getsigcachehits` RPC that
   returns the cumulative hit/miss count of `src/script/sigcache.cpp`.
   Useful for diagnosing mempool-vs-block double work. The wiring
   pattern is in `src/rpc/misc.cpp`.

## 7. Further reading

- "The BLAKE2 cryptographic hash and MAC", RFC 7693.
- Biryukov and Khovratovich, "Equihash: Asymmetric Proof-of-Work
  Based on the Generalized Birthday Problem", NDSS 2016.
- "ZIP-215 Explicitly Defining and Modifying Ed25519 Validation Rules".
- The
  [ed25519-zebra README](https://github.com/ZcashFoundation/ed25519-zebra)
  for the rationale behind strict Ed25519 in Zcash.
