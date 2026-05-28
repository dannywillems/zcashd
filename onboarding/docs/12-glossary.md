---
sidebar_position: 12
title: "Glossary"
description: "Domain-specific abbreviations zcashd uses, each anchored to the file where the term is defined or first used."
---

# Glossary

## 1. Why this chapter exists

zcashd uses many terms and abbreviations whose meaning is not obvious
from their letters. A reader who does not recognise "IVK" or
"valueBalance" will silently misread code. This is a flat
alphabetical list, with each entry pointing to the file where the
term is defined or first used.

## 2. Definitions

### A

- **`addrman`** - The peer-address manager, `CAddrMan`. See
  [src/addrman.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/addrman.h).
- **`addrv2`** - Address relay message v2 (BIP 155); supports Tor v3,
  I2P, CJDNS. Handled in
  [src/net.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/net.cpp).
- **AEAD** - Authenticated Encryption with Associated Data. The note
  ciphertexts use AEAD constructions.
- **`ak`** - Sapling spend authorising public key. See
  [src/zcash/address/zip32.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/zcash/address/zip32.h).
- **`anchor`** - The root of a note commitment tree at the time of a
  spend. Stored per spend description.
- **API tx** - A transaction received via `sendrawtransaction` or
  `z_sendmany`, vs one received over P2P.
- **`ask`** - Sapling spend authorising secret key. See
  `src/zcash/address/zip32.h`.

### B

- **`BatchValidator`** - The Rust object that accumulates Sapling or
  Orchard bundles and verifies them as a single batched call. See
  [src/rust/src/sapling.rs](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/sapling.rs)
  and
  [src/rust/src/orchard_ffi.rs](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/orchard_ffi.rs).
- **BDB** - BerkeleyDB. The wallet storage format. See
  [src/wallet/db.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/wallet/db.h).
- **`bindingSig`** - The single per-bundle binding signature that
  ties the value commitments to `valueBalance`.
- **BLAKE2b/BLAKE2s** - The Zcash hash family. Personalised
  variants are pervasive.
- **BLS12-381** - The pairing-friendly curve used by Sapling. Outer
  curve.
- **BN-254** - The pairing-friendly curve used by Sprout.
- **branch ID** - A 32-bit identifier for each network upgrade,
  enforced in transaction sighashes from Overwinter onward. Defined
  in
  [src/consensus/upgrades.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/consensus/upgrades.cpp).
- **`bundlecache`** - Per-bundle validation cache. See
  [src/rust/src/bundlecache.rs](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/bundlecache.rs).

### C

- **`CBlock`/`CBlockHeader`** - The on-wire block type. See
  [src/primitives/block.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/primitives/block.h).
- **`CBlockIndex`** - In-memory block header tree. See
  [src/chain.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/chain.h).
- **`CCoinsView`/`CCoinsViewCache`** - UTXO set abstraction. See
  [src/coins.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/coins.h).
- **`CChainParams`** - Per-network parameters (mainnet/testnet/regtest).
  See
  [src/chainparams.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/chainparams.h).
- **`cm`** - Note commitment.
- **`cmx`** - Orchard note commitment x-coordinate (the public form).
- **`cv`** - Sapling value commitment.
- **`cv_net`** - Orchard net value commitment (per action).
- **`CTransaction`** - The on-wire transaction type. See
  [src/primitives/transaction.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/primitives/transaction.h).
- **`CValidationState`** - Accumulator for validation errors. See
  [src/consensus/validation.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/consensus/validation.h).
- **cxx** - The Rust/C++ bridge crate
  ([dtolnay/cxx](https://github.com/dtolnay/cxx)). See
  [src/rust/src/bridge.rs](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/bridge.rs).

### D

- **DA / FLTS** - Terms from the spec's automata vocabulary; rarely
  surface in code.
- **`d` (diversifier)** - 11-byte randomness in a Sapling/Orchard
  address.
- **dust** - Outputs smaller than the per-pool dust threshold; see
  [ZIP-205, ZIP-206](https://zips.z.cash/).

### E

- **ECC** - Electric Coin Company. Historical maintainer.
- **`epk`** - Ephemeral public key in a Sapling/Orchard note
  encryption.
- **`enc_ciphertext`** - The recipient-facing note ciphertext.
- **Equihash** - The proof-of-work algorithm. See
  [src/crypto/equihash.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/crypto/equihash.h).
- **`esk`** - Ephemeral secret key (sender side of note encryption).

### F

- **F4Jumble** - The four-round Feistel used in
  [ZIP-316](https://zips.z.cash/zip-0316) Unified Address encoding.
- **`fOverwintered`** - Consensus flag on a transaction asserting it
  is in Overwinter format.
- **FFI** - Foreign-function interface. Two flavours in this repo:
  the original `extern "C"` (`src/rust/include/rust/*.h`) and the
  newer cxx-bridge (`src/rust/src/bridge.rs`).
- **FVK / UFVK** - Full Viewing Key, Unified Full Viewing Key.

### G

- **`g_d`** - Sapling diversifier base, derived from `d`.
- **Gitian** - Deterministic build system for releases. See
  [contrib/gitian-descriptors/](https://github.com/zcash/zcash/tree/v5.5.0-rc1/contrib/gitian-descriptors).
- **Groth16** - Pairing-based zk-SNARK proof system. Used by Sprout
  (post-CVE) and Sapling.

### H

- **Halo 2** - The IPA-based zk-SNARK proof system used by Orchard.
- **`hashAuthDataRoot`** - NU5 commitment to per-bundle auth data.
- **`hashChainHistoryRoot`** - ZIP-221 history MMR commitment.
- **`hashSaplingRoot`** - Sapling note commitment tree root.
- **`Hash160`** - $\mathsf{RIPEMD160}(\mathsf{SHA256}(\cdot))$.
- **HD** - Hierarchical Deterministic key derivation (BIP-32 /
  ZIP-32).
- **HRP** - Human-Readable Prefix (Bech32).

### I

- **IMT** - Incremental Merkle Tree. See
  [src/zcash/IncrementalMerkleTree.hpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/zcash/IncrementalMerkleTree.hpp).
- **`inv`** - "Inventory" message: announcement of an object by hash.
- **IPA** - Inner-product argument; the polynomial commitment used by
  Halo 2.
- **`ivk`** - Incoming Viewing Key (Sapling/Orchard).

### J

- **JoinSplit** - The Sprout shielded transaction primitive: up to
  2 input notes, up to 2 output notes, in one zk proof.
- **Jubjub** - The in-circuit curve embedded in BLS12-381. Used by
  Sapling.

### K

- **KA** - Key Agreement (Diffie-Hellman over Jubjub or Pallas).
- **KDF** - Key Derivation Function.

### L

- **LevelDB** - The on-disk key-value store. Vendored in
  [src/leveldb/](https://github.com/zcash/zcash/tree/v5.5.0-rc1/src/leveldb).
- **librustzcash** - The umbrella workspace of Rust crates outside
  zcashd:
  [github.com/zcash/librustzcash](https://github.com/zcash/librustzcash).

### M

- **`mapBlockIndex`** - Map of block-header hash to `CBlockIndex`.
- **`mapWallet`** - Wallet's map of transaction hash to `CWalletTx`.
- **MPC** - Multi-Party Computation. Used to generate the
  Sprout/Sapling SRS.

### N

- **`nBranchId` / `nConsensusBranchId`** - The branch ID a transaction
  is bound to.
- **`nf` / nullifier** - Output of $\mathsf{PRF}^{\mathsf{nf}}$
  applied to a note. A spent note reveals exactly one nullifier.
- **`nk`** - Nullifier deriving key (Sapling).
- **NU** - Network Upgrade. The Zcash term for a hard fork.
- **NU5** - The fifth network upgrade. Activates Orchard and v5
  transactions.

### O

- **`ock`** - Outgoing Cipher Key (Sapling).
- **Orchard** - The post-NU5 shielded pool, on Halo 2.
- **`out_ciphertext`** - Sender-facing note ciphertext (so the holder
  of the `ovk` can decrypt their own outgoing transactions).
- **Overwinter** - The second NU. Introduced transaction expiry and
  branch IDs.
- **`ovk`** - Outgoing Viewing Key.

### P

- **PoW** - Proof of Work. Zcash uses Equihash $(n, k)$.
- **Pallas / Vesta** - The Pasta cycle of curves used by Orchard.
- **`peers.dat`** - Persistent `addrman` storage.
- **Pedersen hash** - Bowe-Hopwood Pedersen in-circuit hash used by
  Sapling.
- **Poseidon** - In-circuit hash used by some Orchard primitives.
- **`pk_d`** - Diversified payment key (Sapling/Orchard).
- **PRF** - Pseudorandom Function.

### R

- **`rcm`** - Note commitment randomness (Sapling).
- **`rcv`** - Value commitment randomness.
- **RedJubjub / RedPallas** - Sapling and Orchard signature schemes.
- **regtest** - The regression-test network. Low PoW, configurable
  activations.
- **`rho`** - Per-note value used in nullifier derivation.
- **`rk`** - Randomised verification key for a spend.
- **RPC** - Remote Procedure Call. The JSON-RPC server in
  [src/rpc/](https://github.com/zcash/zcash/tree/v5.5.0-rc1/src/rpc).
- **`rseed`** - Sapling note randomness seed (post-ZIP-212).
- **`rt`** - Note commitment tree root (the spend's anchor).

### S

- **Sapling** - The second shielded pool. Groth16, BLS12-381, Jubjub.
- **`secp256k1`** - The transparent-layer curve. Two implementations
  in the tree: vendored
  [src/secp256k1/](https://github.com/zcash/zcash/tree/v5.5.0-rc1/src/secp256k1)
  and the Rust `secp256k1` crate.
- **Sinsemilla** - The in-circuit hash used by Orchard.
- **SHA-256** - Hash used for txids (pre-NU5), block hashes,
  checksums.
- **sighash** - The hash a transaction's signatures sign over. ZIPs
  143, 243, 244, 225 define the per-NU variants.
- **`sigcache`** - Cache of validated ECDSA signatures. See
  [src/script/sigcache.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/script/sigcache.cpp).
- **Sprout** - The original shielded pool.
- **SPV** - Simplified Payment Verification (light clients).
- **SRS** - Structured Reference String (the Groth16 trusted setup
  output).

### T

- **`tableRPC`** - The global dispatch table of RPC commands.
- **testnet** - The public testnet. Frequently reset.
- **Tor v3** - The anonymity network. Supported via
  [src/torcontrol.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/torcontrol.cpp).
- **turnstile** - [ZIP-209](https://zips.z.cash/zip-0209): net value
  flowing into a pool can be tracked, and unauthorised counterfeiting
  becomes detectable on the chain.

### U

- **UA / UVK / UFVK / UIVK** - Unified Address / Viewing Key / Full
  VK / Incoming VK. See
  [ZIP-316](https://zips.z.cash/zip-0316).
- **`ufvk1...`, `uivk1...`, `u1...`** - Bech32m-encoded unified
  objects.
- **UTXO** - Unspent Transaction Output (transparent only).

### V

- **`v` / valueBalance / `valueBalanceSapling` / `valueBalanceOrchard`** -
  Net value moving out of a shielded bundle. Public.
- **`vUpgrades`** - The activation table in
  [src/consensus/params.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/consensus/params.h).
- **`vFundingStreams`** - The per-NU funding-stream table. See ZIP-207.

### W

- **`WalletTxBuilder`** - The modern shielded transaction builder.
  See
  [src/wallet/wallet_tx_builder.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/wallet/wallet_tx_builder.h).
- **WIF** - Wallet Import Format (transparent key encoding).

### Z

- **`zcash_history`** - The Rust crate implementing the ZIP-221 MMR.
- **`zcash_note_encryption`** - Rust crate for Sapling/Orchard note
  encryption.
- **`zcash_primitives`** - Rust crate with Zcash types and consensus
  rules.
- **`zcash_proofs`** - Rust crate for Sapling proving and Sprout
  verifying.
- **zebra / zebrad** - The Zcash Foundation's Rust full-node
  implementation:
  [github.com/ZcashFoundation/zebra](https://github.com/ZcashFoundation/zebra).
- **ZIP** - Zcash Improvement Proposal. See
  [zips.z.cash](https://zips.z.cash/).
- **ZIP-32** - HD key derivation for Sapling and Orchard.
- **ZIP-209** - Turnstile enforcement.
- **ZIP-225** - v5 transaction format.
- **ZIP-244** - NU5 transaction digests and sighash.
- **ZIP-316** - Unified Addresses and viewing keys.
- **ZK / zk-SNARK** - Zero-Knowledge Succinct Non-interactive
  ARgument of Knowledge.
- **ZMQ** - ZeroMQ; optional publisher in
  [src/zmq/](https://github.com/zcash/zcash/tree/v5.5.0-rc1/src/zmq).

## 3. The code

This is a glossary, not a chapter with its own implementation. Each
term above links to the file where it lives.

## 4. Failure modes

- **Using a term from this glossary in code without ensuring the
  reader will recognise it.** Caught by review only. The glossary is
  here so contributors can include only well-known terms in code
  comments and link unknown ones.
- **Glossary drift.** If a term is renamed in code, the link here
  rots. Run a periodic link-check.

## 5. Spec pointers

- The Zcash Protocol Specification has its own glossary in section
  1.4. This chapter complements but does not replace it.
- The librustzcash repositories use the same vocabulary; their
  documentation comments are authoritative for any term defined
  there.

## 6. Exercises

1. **Spot a missing term.** Pick five terms from
   [src/consensus/upgrades.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/consensus/upgrades.cpp)
   that are not in this glossary. Either find them in the spec or
   open an issue.

2. **Cross-check.** For one entry above, follow the link and verify
   the term is actually defined there. (This is a maintenance task
   masquerading as an exercise.)

3. **Annotate a transaction.** Decode a v5 testnet transaction using
   `zcash-inspect`. Identify every named field (e.g. `cv`, `nf`,
   `rk`, `cmx`, `enc_ciphertext`, `out_ciphertext`,
   `valueBalanceOrchard`, `bindingSig`). Cross-check each against
   this glossary.

## 7. Further reading

- The
  [Protocol Specification glossary](https://zips.z.cash/protocol/protocol.pdf)
  (section 1.4).
- The
  [librustzcash documentation](https://docs.rs/zcash_primitives/)
  for type-level definitions.
