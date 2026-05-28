---
sidebar_position: 1
title: "Context and history"
description: "What zcashd is, who maintains it, where it sits in the Zcash ecosystem, and why the codebase looks the way it does."
---

# Context and history

## 1. Why this chapter exists

Before reading code, understand what zcashd is, who maintains it, and
why it looks the way it does. The repository carries thirteen years of
accumulated decisions from Bitcoin Core and ten from Zcash. None of the
layout will make sense without that history. A reader who skips this
chapter will mistake legacy decisions for current ones and propose
patches that make perfect sense in isolation but break consensus or
collide with policy.

## 2. Definitions

**Definition 1.1 (Zcash).** Zcash is a payment system based on the
Zerocash protocol (Sasson, Chiesa, Garman, Green, Miers, Tromer, Virza;
IEEE S&P 2014). It is a Bitcoin-derived blockchain that adds three
shielded payment systems (Sprout, Sapling, Orchard), each built on a
zero-knowledge proof system.

**Definition 1.2 (Shielded transaction).** A transaction whose sender,
recipient, and amount are hidden from a chain observer, with validity
attested by a zero-knowledge proof. A single Zcash transaction can mix
transparent inputs/outputs with Sprout JoinSplits, a Sapling bundle, and
an Orchard bundle.

**Definition 1.3 (Network upgrade, NU).** A coordinated hard fork.
Activated at a fixed mainnet block height with a 32-bit branch ID. From
Overwinter onward, the branch ID is part of every transaction's
sighash (replay protection); see [chapter 04](./04-consensus.md).

**Definition 1.4 (Implementation).** A full-validating node software
package that enforces consensus. Zcash has two production
implementations: zcashd (this repo, C++/Rust) and zebrad
(Zcash Foundation, Rust). Different architecture, same consensus.

## 3. The code

The first line in `zcashd`'s daemon entry point is the easiest anchor
for "is this code Bitcoin or Zcash":

```cpp reference title="src/bitcoind.cpp (entry point)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/bitcoind.cpp#L1-L40
```

The deprecation guard is one of the operational artefacts unique to
zcashd. It is not a consensus rule; it forces nodes that have not been
updated in roughly four months to halt:

```cpp reference title="src/deprecation.h (deprecation height)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/deprecation.h#L1-L40
```

The check happens in `EnforceNodeDeprecation` in
[src/deprecation.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/deprecation.cpp).
Each release bumps `APPROX_RELEASE_HEIGHT`. A release that lifts or
extends this guard must be considered carefully against the operator
base.

### Implementations

There are two production-grade full-node implementations.

- **zcashd** (this repository). C++ with a large and growing Rust core
  (`librustzcash`). Maintained historically by the Electric Coin
  Company (ECC) and now in transition.
- **zebra** ([github.com/ZcashFoundation/zebra](https://github.com/ZcashFoundation/zebra)).
  Rust, written from scratch by the Zcash Foundation. Different
  architecture, same consensus.

A node operator can run either. zcashd has the legacy wallet and most
of the RPC surface that exchanges and custodians depend on; zebrad is
the modern node.

### Who maintains zcashd

Historically: the Electric Coin Company (ECC), a company in Denver
founded by Zooko Wilcox and others, which led both protocol research
and zcashd development. ECC announced in late 2024 / early 2025 that
it would step back from zcashd maintenance and concentrate on the
wallet (Zashi) and on protocol research. The Zcash Foundation continues
zebrad.

ZODL (Zcash Open Development Layer) was created to take over zcashd
maintenance. The reader is presumed to be joining ZODL.

Check `doc/authors.md` and the recent git log. The standard
"who is active right now" probe:

```bash
git shortlog -sne --since="2 years ago"
```

### Relationship to Bitcoin Core

This is a forked codebase, not a rewrite. Many files carry the
original Satoshi/Bitcoin copyright header alongside the Zcash one:

```cpp
// Copyright (c) 2009-2010 Satoshi Nakamoto
// Copyright (c) 2009-2014 The Bitcoin Core developers
// Copyright (c) 2016-2023 The Zcash developers
```

Implications:

- The build system (autotools), the test framework (`qa/rpc-tests`),
  the networking stack (`net.cpp`), the script interpreter
  (`script/`), and the wallet storage (`wallet/db.cpp` on BerkeleyDB)
  are all directly inherited.
- Bitcoin Core has continued to evolve since 0.11.2 (and is now on
  28.x); zcashd has cherry-picked some changes but is structurally
  closer to 0.12 than to current Bitcoin Core. Many Bitcoin Core
  improvements (BIP 152 compact blocks, BIP 157 client-side filters,
  the new BlockManager architecture, the move from BDB to sqlite for
  wallets, the asyncio test framework) are not present.
- Bitcoin idioms (CBlock, CTransaction, CScript, CCoinsViewCache, the
  `net.h` peer model, `CValidationState`) all apply. If a function
  does not look Zcash-specific, the answer is probably in a Bitcoin
  Core resource.

Working mental model: zcashd is "Bitcoin Core 0.12 plus a large Rust
extension for shielded protocols, with the wallet and consensus rules
modified to support those protocols".

### The shielded protocols, briefly

Detailed in [chapter 07](./07-zk-proofs-and-pools.md). The short version:

- **Sprout** (2016). The original Zerocash construction. Groth16 (post-CVE)
  on BN-254, ~45s to spend on launch hardware, 2-in/2-out per JoinSplit.
  Considered legacy.
- **Sapling** (NU3, 2018). Groth16 on BLS12-381, Jubjub for in-circuit
  ops. Spend and Output descriptions are independent. ~50x faster than
  Sprout.
- **Orchard** (NU5, 2022). Halo 2 proofs (no trusted setup), Pallas and
  Vesta curves (Pasta cycle), Sinsemilla hash. Adds unified addresses
  via ZIP-316.

### Network upgrades

A "network upgrade" is Zcash's term for a hard fork. The activation
table for mainnet is implemented in `src/consensus/upgrades.cpp`:

```cpp reference title="src/consensus/upgrades.cpp (the activation table)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/consensus/upgrades.cpp#L1-L60
```

Mainnet activation heights:

| Upgrade | Branch ID | Height | What activates |
|---------|-----------|--------|----------------|
| Sprout | 0x00000000 | genesis | original Zerocash chain |
| Overwinter | 0x5ba81b19 | 347500 | transaction expiry, v3 tx |
| Sapling | 0x76b809bb | 419200 | Sapling spends and outputs, v4 tx |
| Blossom | 0x2bb40e60 | 653600 | 75-second block target |
| Heartwood | 0xf5b9230b | 903000 | shielded coinbase, ZIP-221 history MMR |
| Canopy | 0xe9ff75a6 | 1046400 | funding streams replace founders reward |
| NU5 | 0xc2d6d0b4 | 1687104 | Orchard, v5 tx, ZIP-244 |

`UPGRADE_ZFUTURE` is an integration-testing placeholder, not a real
upgrade. There is no NU6 in this codebase at the time of writing
(zcashd v5.5.0-rc1 was the last ECC release).

### Trusted setups

Sprout used a Multi-Party Computation ceremony with six participants
in October 2016. Sapling used a much larger Powers of Tau ceremony in
2017-2018 ("MPC Round 1") followed by a Sapling-specific phase 2. The
parameter files must be present on disk for the node to verify proofs;
`zcutil/fetch-params.sh` downloads them and they are loaded in
`src/rust/src/rustzcash.rs::librustzcash_init_zksnark_params`.

Orchard uses Halo 2 and has no trusted setup. Its keys are derived
deterministically.

### What "ZODL takeover" means for the reader

The reader is inheriting a codebase whose original maintainers will
not be at their elbow. Practical consequences:

1. Read the existing tests as a specification of intended behaviour.
   They encode many assumptions that nobody is around to explain.
2. Treat the Zcash Protocol Specification as authoritative for
   consensus. Where code and spec disagree, the code is consensus
   (since that is what the network runs), but the discrepancy is
   almost certainly a bug or an undocumented divergence; investigate,
   do not just patch.
3. The Rust workspace under `src/rust/` depends on `librustzcash` (the
   ecosystem at
   [github.com/zcash/librustzcash](https://github.com/zcash/librustzcash)).
   Many critical changes will be upstream there, not in this repo.
4. Some C++ subsystems (Sprout, the old wallet, the legacy address
   logic) are effectively in maintenance mode and any changes need
   extreme conservatism. Other subsystems (Orchard, NU5 transaction
   format, metrics, tracing) are actively evolving.
5. Security disclosures still go through `security@z.cash`; see
   `SECURITY.md` for the PGP key and the disclosure policy.

## 4. Failure modes

- **Treating zcashd as up-to-date Bitcoin Core.** It is not. BIP 152
  compact blocks do not exist here; BlockManager does not exist; the
  wallet is still BDB.
- **Treating the spec as descriptive.** The spec is normative for
  consensus. Caught by: cross-implementation diff with zebra.
- **Bumping `APPROX_RELEASE_HEIGHT` without re-checking
  `ACTIVATION_TO_DEPRECATION_BLOCKS`.** A release that ships with an
  already-passed deprecation height bricks every node immediately.
  No automated test in this workspace; caught by hand at release
  time.
- **Forgetting that ZFUTURE is not real.** Code paths gated on
  ZFUTURE never run on mainnet. A change accidentally guarded behind
  ZFUTURE will silently not activate. Caught by code review only.

## 5. Spec pointers

- [Zcash Protocol Specification](https://zips.z.cash/protocol/protocol.pdf),
  section 1 (Introduction) and section 6.1 (Network upgrade
  identifiers).
- [ZIP-200](https://zips.z.cash/zip-0200): network upgrade mechanism.
- [ZIP-201](https://zips.z.cash/zip-0201): network peer management
  for nodes.
- [ZIP-202](https://zips.z.cash/zip-0202): ascending transaction
  version numbers.
- [ZIP-252](https://zips.z.cash/zip-0252): deployment of NU5.

The Zerocash paper (Sasson et al., 2014) is the founding document for
Sprout. The Sapling and Orchard papers (collected on the ECC site)
extend it.

## 6. Exercises

1. **Activation date.** Open
   [src/chainparams.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/chainparams.cpp)
   and find the mainnet activation height for NU5. Cross-check
   against the table above. Answer: search for "NU5" in
   `CMainParams`.

2. **Deprecation arithmetic.** What block height does a build pinned to
   `APPROX_RELEASE_HEIGHT = 2300000` deprecate at? Answer is in
   [src/deprecation.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/deprecation.h):
   `APPROX_RELEASE_HEIGHT + ACTIVATION_TO_DEPRECATION_BLOCKS`.

3. **Spec-to-code map.** Find the spec section that defines the
   branch ID format, then find the C++ struct that holds branch IDs.
   Answer: `Consensus::NetworkUpgrade::nBranchId` in
   [src/consensus/params.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/consensus/params.h).

4. **Modification exercise.** Add a private build-time toggle that
   logs the current epoch's branch ID at startup. Hint: read
   `CurrentEpochBranchId` in
   [src/consensus/upgrades.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/consensus/upgrades.cpp)
   and hook it into `AppInit2` in `src/init.cpp` behind a `-debug=` flag.
   Run on regtest and confirm the value changes across `nuparams=`
   activations.

## 7. Further reading

- "Mastering Bitcoin" (Antonopoulos) chapters 5 - 9 for the
  Bitcoin-Core inherited concepts.
- ECC engineering blog posts on the v5.0.0 NU5 release (search
  electriccoin.co for "NU5 release").
- The Zcash Foundation's Arborist meeting minutes, the longest-running
  public record of protocol-level discussion among the implementers.
