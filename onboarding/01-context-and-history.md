# 01 - Context and history

Before reading code, understand what zcashd is, who maintains it, and why it
looks the way it does. The repository carries thirteen years of accumulated
decisions from Bitcoin Core and ten from Zcash. None of the layout will make
sense without that history.

## What is Zcash

Zcash is a payment system based on the Zerocash protocol (Sasson, Chiesa,
Garman, Green, Miers, Tromer, Virza; IEEE S&P 2014). It started as a fork of
Bitcoin Core 0.11.2 in late 2015, shipped on 28 October 2016, and has since
added three further shielded payment systems (Sapling, Orchard) and several
consensus upgrades.

The core property is that transactions can hide sender, receiver, and amount
using zero-knowledge proofs. The chain still has transparent UTXOs that work
like Bitcoin's; the privacy guarantee applies only to shielded transactions.

## Implementations

There are two production-grade full-node implementations.

- `zcashd` (this repository). C++ with a large and growing Rust core
  (`librustzcash`). Maintained historically by the Electric Coin Company
  (ECC) and now in a transition. See chapter 11 for current maintainership.
- `zebra` (`https://github.com/ZcashFoundation/zebra`). Rust, written from
  scratch by the Zcash Foundation. Different architecture, same consensus.

A node operator can run either. zcashd has the legacy wallet and most of the
RPC surface that integrations depend on; zebrad is the modern node.

## Who maintains zcashd

Historically: the Electric Coin Company (ECC), a company in Denver founded by
Zooko Wilcox and others, which led both protocol research and zcashd
development. ECC announced in late 2024 / early 2025 that it would step back
from zcashd maintenance and concentrate on the wallet (Zashi) and on protocol
research. The Zcash Foundation continues zebrad.

ZODL (Zcash Open Development Layer) was created to take over zcashd
maintenance. This is the context in which you are reading this course: you
are joining ZODL as a principal cryptography engineer, and zcashd is the
codebase you will be responsible for.

Check `doc/authors.md` and the recent git log to see who has contributed
recently. Use `git shortlog -sne --since="2 years ago"` for an active-author
list.

## Deprecation policy

zcashd has an automatic shutdown after a fixed number of blocks since the
release height. The constants are in `src/deprecation.h`:

```
APPROX_RELEASE_HEIGHT          // set per release
ACTIVATION_TO_DEPRECATION_BLOCKS  // number of blocks to live
DEPRECATION_HEIGHT             // sum of the above
```

The check runs in `EnforceNodeDeprecation` in `src/deprecation.cpp`. This is
not a consensus rule, it is an operational guard: a build that has not been
updated in roughly four months will halt and refuse to continue. Each release
bumps `APPROX_RELEASE_HEIGHT`. Releases that drop this guard or extend it
must be considered carefully against the user base.

## Relationship to Bitcoin Core

This is a forked codebase, not a rewrite. Many files carry the original
Satoshi/Bitcoin copyright header alongside the Zcash one, for example:

```
// Copyright (c) 2009-2010 Satoshi Nakamoto
// Copyright (c) 2009-2014 The Bitcoin Core developers
// Copyright (c) 2016-2023 The Zcash developers
```

Implications:

- The build system (autotools), the test framework (`qa/rpc-tests`), the
  networking stack (`net.cpp`), the script interpreter (`script/`), and the
  wallet storage (`wallet/db.cpp` on BerkeleyDB) are all directly inherited.
- Bitcoin Core has continued to evolve since 0.11.2 (and is now on 28.x);
  zcashd has cherry-picked some changes but is structurally closer to 0.12
  than to current Bitcoin Core. Many Bitcoin Core improvements (BIP 152
  compact blocks, BIP 157 client-side filters, the new BlockManager
  architecture, the move from BDB to sqlite for wallets, the asyncio
  test framework) are not present.
- Bitcoin idioms (CBlock, CTransaction, CScript, CCoinsViewCache, the
  `net.h` peer model, `CValidationState`) all apply. If a function does not
  look Zcash-specific, the answer is probably in a Bitcoin Core resource.

A working mental model: read zcashd as "Bitcoin Core 0.12 plus a large Rust
extension for shielded protocols, with the wallet and consensus rules
modified to support those protocols".

## The shielded protocols, briefly

You will read the details in chapter 07. The short version:

- Sprout (2016). The original Zerocash construction. Groth-Maller proof
  system, BN-254 curve, very expensive to spend (45+ seconds per JoinSplit
  on launch hardware), 2-in/2-out per JoinSplit. Now considered legacy:
  funds should be migrated out, and the implementation has known
  weaknesses against a counterfeiting bug (CVE-2019-7167) for which
  zcashd has the patched parameters.
- Sapling (Heartwood NU activated 2018). Groth16 proofs on BLS12-381,
  Jubjub curve for in-circuit operations. Spend and Output descriptions
  are independent (so a transaction can have many spends and many outputs).
  Roughly 100x faster than Sprout.
- Orchard (NU5, activated 2022). Halo 2 proofs (no trusted setup), Pallas
  and Vesta curves (Pasta cycle), Sinsemilla hash. Adds unified addresses
  via ZIP-316. This is the current state of the art and where most new
  cryptographic work lands.

Transactions can mix transparent inputs/outputs, Sprout JoinSplits, Sapling
spend/output bundles, and Orchard action bundles. The transaction format has
several historical versions; the current one (v5) is defined in ZIP-225 and
activated at NU5.

## Network upgrades

A "network upgrade" is what Zcash calls a hard fork. Each one is identified
by a 32-bit branch ID and activates at a specific block height on each
network (mainnet, testnet, regtest). The history is in
`src/consensus/upgrades.cpp`:

```
Sprout                  0x00000000   genesis
Overwinter              0x5ba81b19   block 347500   (transaction expiry, v3 tx)
Sapling                 0x76b809bb   block 419200   (Sapling proofs)
Blossom                 0x2bb40e60   block 653600   (75s block target)
Heartwood               0xf5b9230b   block 903000   (shielded coinbase, history tree)
Canopy                  0xe9ff75a6   block 1046400  (funding streams replace founders reward)
NU5                     0xc2d6d0b4   block 1687104  (Orchard, v5 tx, ZIP-244)
```

There is no NU6 in this codebase at the time of writing (zcashd v5.5.0-rc1
was the last ECC release; check the current state with `git log
src/chainparams.cpp` and `git log src/consensus/upgrades.cpp`).

`UPGRADE_ZFUTURE` is an integration-testing placeholder, not a real upgrade.

## Trusted setups

Sprout used a "Multi-Party Computation" ceremony with six participants in
October 2016. Sapling used a much larger "Powers of Tau" ceremony in 2017-2018
("MPC Round 1") followed by a Sapling-specific phase 2. The parameter files
must be present on disk for the node to verify proofs; `zcutil/fetch-params.sh`
downloads them and they are loaded in `src/rust/src/rustzcash.rs::librustzcash_init_zksnark_params`.

Orchard uses Halo 2 and has no trusted setup; its keys are derived
deterministically.

## What "ZODL takeover" means for you

You are inheriting a codebase whose original maintainers will not be at your
elbow. Practical consequences:

1. Read the existing tests as a specification of intended behaviour. They
   encode many assumptions that nobody is around to explain.
2. Treat the Zcash Protocol Specification as authoritative for consensus.
   Where code and spec disagree, the code is consensus (since that is what
   the network runs), but the discrepancy is almost certainly a bug or an
   undocumented divergence; investigate, do not just patch.
3. The Rust workspace under `src/rust/` depends on `librustzcash` (the
   ecosystem of crates published at `https://github.com/zcash/librustzcash`).
   Many critical changes will be upstream there, not in this repository.
4. Some C++ subsystems (Sprout, the old wallet, the legacy address logic)
   are effectively in maintenance mode and any changes need extreme
   conservatism. Other subsystems (Orchard, NU5 transaction format,
   metrics, tracing) are actively evolving.
5. Security disclosures still go through `security@z.cash`; see
   `SECURITY.md` for the PGP key and the disclosure policy. ZODL inherits
   the responsibility of being on the receiving end.
