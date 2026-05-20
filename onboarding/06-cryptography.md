# 06 - Cryptography (non-ZK)

This chapter covers the cryptographic primitives that are not part of the
zero-knowledge stack. The zero-knowledge stack (Groth16, Halo 2, the
shielded protocols) is the subject of chapter 07.

The split between C++ and Rust is approximately:

- **C++ owns**: SHA-2 family, RIPEMD160, HMAC-SHA-2, ChaCha20, AES, the
  Equihash verifier, and the Bitcoin Script signature verification (via
  vendored libsecp256k1).
- **Rust owns**: BLAKE2b, Ed25519 (Zebra-style), the transparent ECDSA
  used by the Rust crates (a separate `secp256k1` crate), every elliptic
  curve used inside zk-SNARKs (BLS12-381, Jubjub, Pallas, Vesta), RedDSA
  / RedJubjub / RedPallas, Pedersen and Sinsemilla hashes, Poseidon (where
  used), the entire shielded-pool primitive set.

This duplication is historical: anything that predates `librustzcash`
exists in C++; anything since has been added in Rust. Where both exist
(e.g. SHA-256 and BLAKE2b are both reachable from both sides via FFI),
the active code path goes through whichever side hosts the calling
subsystem.

## Hashes

### SHA-256

`src/crypto/sha256.{h,cpp}` plus four ISA-specific accelerated impls
(`sha256_avx2.cpp`, `sha256_sse4.cpp`, `sha256_sse41.cpp`,
`sha256_shani.cpp`). At startup, `CSHA256::AutoDetect` selects the best
implementation based on CPUID.

`CHash256` (in `src/hash.h`) is double-SHA256, used for txid (pre-NU5),
block hash, addr checksums, and many other Bitcoin-style hashes.

### SHA-512 and SHA-1

`src/crypto/sha512.{h,cpp}` and `sha1.{h,cpp}`. SHA-512 is used via HMAC
inside BIP-32 derivation (transparent keys). SHA-1 is present for legacy
Bitcoin Script `OP_SHA1`.

### RIPEMD160

`src/crypto/ripemd160.{h,cpp}`. Used in `Hash160 = RIPEMD160(SHA256(x))`,
the standard Bitcoin address fingerprint.

### HMAC

`src/crypto/hmac_sha256.{h,cpp}` and `hmac_sha512.{h,cpp}`. Used for
BIP-32 derivation and for any keyed MAC.

### BLAKE2b and BLAKE2s

`src/rust/src/blake2b.rs` (wrapping `blake2b_simd`) exposes a small C++
interface via cxx (header `src/rust/include/rust/blake2b.h`). BLAKE2s is
used internally to the Sapling Rust code.

BLAKE2 is *the* Zcash hash. The Zcash design uses BLAKE2b with **personalisation
strings** everywhere; the personalisation discriminates one cryptographic
context from another so that hashes intended for different purposes can
never collide even if they hash the same input bytes.

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

These are defined in protocol-spec sections and reproduced as constants
in `zcash_primitives::constants::*` (Rust) and per-call-site byte arrays
on the C++ side. A wrong personalisation byte is a consensus-breaking
bug.

Read `src/zcash/Address.hpp:23` for an example of how a C++ caller declares
one of these constants.

### Equihash

Equihash (Biryukov-Khovratovich, NDSS 2016) is the proof-of-work. zcashd
verifies the solution in `src/crypto/equihash.{h,cpp,tcc}`. Mining uses
the Tromp solver in `src/pow/tromp/` (only with `--enable-mining`).

Parameters:

- mainnet/testnet: `n=200, k=9` (so the solution is 1344 bits = 168
  bytes, encoded with `equihash_solution_size(200, 9) = 1344/8 = 168`).
- regtest: `n=48, k=5`.

The Equihash input is BLAKE2b-keyed by the block header (minus the
solution), and the verifier checks that the solution indices XOR to zero
in the expected tree structure and that none of the involved chunks
collide outside the expected positions.

Reading order:

1. `src/crypto/equihash.h` for the data layout.
2. `src/crypto/equihash.tcc` (the template) for the algorithm body.
3. `src/pow.cpp::CheckEquihashSolution` for the validation hookup.
4. The Equihash paper for the theory.

### ChaCha20

`src/crypto/chacha20.{h,cpp}` provides a stand-alone ChaCha20 stream
cipher. Used in `src/random.cpp` for the deterministic PRNG and a few
other places.

### AES

`src/crypto/aes.{h,cpp}` wraps `src/crypto/ctaes/`, a constant-time
software AES. Used by the wallet for passphrase-based wallet encryption
(`src/wallet/crypter.cpp`).

### Note: Bowe-Hopwood Pedersen and Sinsemilla

These are not in `src/crypto/`. They are Rust-only because they are used
exclusively inside zero-knowledge circuits (Sapling and Orchard
respectively). See chapter 07.

## Symmetric crypto: scope of use

Apart from wallet encryption (AES-256-CBC + HMAC over a passphrase-derived
key) and the in-band note encryption (which uses ChaCha20-Poly1305 / a
Sapling-defined AEAD), zcashd does not encrypt anything on the wire. All
P2P traffic is plaintext. There is no Noise-protocol handshake (in
contrast to recent Bitcoin Core BIP 324 work).

## Signature schemes

### secp256k1 ECDSA (transparent)

The vendored `src/secp256k1/` (the original libsecp256k1) provides
ECDSA-over-secp256k1 for transparent transactions. Bitcoin-style
signature serialisation; low-S enforcement; strict DER decoding.
`src/key.cpp` is the C++ wrapper.

Script verification of transparent inputs goes through `src/script/interpreter.cpp`
and ultimately into `secp256k1_ecdsa_verify`. A signature cache
(`src/script/sigcache.cpp`) speeds up repeated verification (mempool
acceptance then block validation of the same tx).

### Ed25519 (Sprout binding)

Each Sprout JoinSplit is signed with an Ed25519 key whose public key is
committed to in the transaction. zcashd uses the `ed25519-zebra` crate
(see `src/rust/src/ed25519.rs`). The choice of `ed25519-zebra` was made
to enforce ZIP-215 strict verification rules (no malleability, agreed
canonical encoding).

### RedJubjub (Sapling)

RedJubjub is the Sapling signature scheme. Two flavours:

- **Spend Authority** signature (over a key derived from `ask`,
  randomised per-spend by `alpha`).
- **Binding** signature (a single per-bundle signature over the
  Sapling balance, computed from the value commitments).

Implemented in `zcash_primitives::sapling::redjubjub`. Used through
`src/rust/src/sapling.rs` and called from
`src/main.cpp::ContextualCheckTransaction` (per-spend) and the
batch verifier (per-bundle).

### RedPallas (Orchard)

Same scheme, instantiated over Pallas instead of Jubjub. Lives in the
`orchard` crate. Same two flavours: spend authorisation per action and
one binding signature per bundle.

### Schnorr / BIP-340

Not used. Zcash does not have Taproot/Schnorr. The transparent layer is
the original Bitcoin ECDSA.

## Address and key encoding

`src/base58.cpp` and `src/bech32.cpp` are the two encodings. zcashd uses:

- Base58Check for transparent addresses (`t1...`, `t3...`) and WIF
  private keys.
- Bech32 for Sapling unified payment addresses and viewing keys
  (`zs1...`, `zviews1...`).
- Bech32m for Unified Addresses (ZIP-316), tagged `u1...`.

The HRP (human-readable prefix) is chain-dependent and lives in
`src/key_constants.h` and per-chain in `src/chainparams.cpp`.

For ZIP-316 (unified addresses, viewing keys, FVKs, IVKs), encoding is
*not* simple Bech32 over the receivers list: there is a per-Receiver type
tag, a length-prefix, an obfuscation step (key-derived F4Jumble
permutation) to make the encoded form non-malleable, and then Bech32m.
Read `src/rust/src/unified_keys_ffi.rs` and the upstream
`zcash_address` crate.

## Randomness

`src/random.{h,cpp}` is the central RNG. `GetRandBytes(n)` is the
canonical "give me cryptographic randomness" call. Underneath:

- On Linux, `getrandom(2)`.
- On macOS, `getentropy(3)`.
- On Windows, `RtlGenRandom`.

Plus an internal `FastRandomContext` for non-cryptographic uses
(insecure_rand). Auditing rule: never use `FastRandomContext` where
cryptographic randomness is required. Search for `insecure_rand` and
`FastRandomContext` in any change you review.

## Constant-time concerns

The C++ side does very little constant-time-sensitive work directly: that
work is delegated to libsecp256k1 (which is constant-time) and to Rust
(where every Zcash-specific operation goes through `subtle::CtOption`
and friends). When you do touch C++ that handles secret material,
remember:

- No branches or indexing by secret bits.
- `subtle::*` does not exist in C++ here; you must roll your own
  `ConditionalMove` or use the `support/cleanse.cpp` helpers for zeroing.
- The wallet `crypter.cpp` is the most secret-handling C++ in the tree
  and the one to study (and to be paranoid about).

## Memory hygiene for secrets

`src/support/lockedpool.cpp` provides an allocator that `mlock`s pages
holding key material to prevent paging. `src/support/cleanse.cpp`
provides `memory_cleanse`, the volatile-memcpy-with-zero used in
destructors of secret-bearing types. New code that holds secrets should
use these.

In Rust, the `zeroize` and `secrecy` crates serve the same purpose and
are already in the dependency set; use them.

## Cryptographic caches

Two important caches:

- `src/script/sigcache.cpp`: maps `(scriptSig, scriptPubKey, hashType, txid)`
  to "this signature was valid". Avoids re-verifying the same ECDSA
  signature when the transaction passes through both mempool and a
  block.
- `src/zcash/cache.cpp`: a proof and signature cache for shielded
  bundles. Same idea: once a Sapling or Orchard proof has been verified
  in any context, do not re-verify it later.

Both caches are bounded in size; their sizing knobs are operationally
relevant for nodes under heavy mempool load.

## Where to look next

If you want to deepen specifically on the Zcash cryptography (as opposed
to the Bitcoin-inherited parts), the densest single read is:

1. The Zcash Protocol Specification, sections 4 (concepts), 5
   (cryptographic primitives), and 6 (consensus changes).
2. The `zcash_primitives` source tree at
   `https://github.com/zcash/librustzcash/tree/main/zcash_primitives`.
3. The `orchard` crate at `https://github.com/zcash/orchard`.

These three together are the cryptographic backbone of the system. Code
in this repository is largely an integration of them.
