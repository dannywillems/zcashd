# 04 - Consensus

Consensus is everything a fully-validating node must agree on byte-for-byte
with every other validating node. Disagreement here is a chain split. In
zcashd, consensus lives in three places:

- `src/consensus/` (parameters and network-upgrade tables)
- `src/main.cpp` (the validation pipeline)
- the Rust verifier crates called via `src/rust/src/*_ffi.rs`

The canonical specification of consensus is the Zcash Protocol Specification
(https://zips.z.cash/protocol/protocol.pdf). The ZIPs index at
https://zips.z.cash/ lists every protocol-level decision. Read both
alongside the code.

## Mental model

A consensus rule in zcashd is one of:

1. A structural check on the wire form of a block or transaction (length,
   version, field ordering). Implemented in the serialisation code and in
   `Check*` functions.
2. A predicate on a block or transaction in isolation
   (`CheckTransaction`, `CheckBlock`). No chain state needed.
3. A predicate that depends on chain state at a specific height
   (`ContextualCheckTransaction`, `ContextualCheckBlock`,
   `ContextualCheckBlockHeader`). Activation rules, expiry, funding
   streams.
4. A predicate that depends on the UTXO set (`ConnectBlock`,
   `CheckInputs`). Double-spend protection, script execution, shielded
   nullifier and anchor checks.
5. A cryptographic check on a proof or signature (`proof_verifier.cpp`
   and Rust batch validators).

Whenever you change consensus, you change behaviour for every node that
runs that build. Get it wrong and you fork the chain. Get it wrong on a
hard-fork boundary and you fork it on purpose; that is precisely the
mechanism by which network upgrades work.

## Consensus parameters

`src/consensus/params.h` defines `Consensus::Params`, the struct that
captures every consensus-relevant parameter of a network (mainnet,
testnet, regtest). It is large. Key fields:

- `hashGenesisBlock`
- `nSubsidySlowStartInterval`, `nPreBlossomSubsidyHalvingInterval`,
  `nPostBlossomSubsidyHalvingInterval`
- `nMajorityEnforceBlockUpgrade`, `nMajorityRejectBlockOutdated`
- `powLimit`, `nPowAveragingWindow`, `nPowMaxAdjustDown`,
  `nPowMaxAdjustUp`, `nPreBlossomPowTargetSpacing`,
  `nPostBlossomPowTargetSpacing`
- `fPowAllowMinDifficultyBlocksAfterHeight`
- `vUpgrades[MAX_NETWORK_UPGRADES]` (the activation table; see below)
- `vFundingStreams[MAX_FUNDING_STREAMS]` (post-Canopy block-reward
  distribution; see ZIP-207, ZIP-214)
- `nFundingPeriodLength`
- the various NU-specific consensus constants

These three classes in `src/chainparams.cpp` instantiate `Consensus::Params`
for the three networks:

```cpp
class CMainParams    : public CChainParams { ... };   // line 86
class CTestNetParams : public CChainParams { ... };   // line 379
class CRegTestParams : public CChainParams { ... };   // line 632
```

For mainnet, the activation heights are:

| Upgrade | Branch ID | Height | What activates |
|---------|-----------|--------|----------------|
| Sprout | 0x00000000 | genesis | the original Zerocash chain |
| Overwinter | 0x5ba81b19 | 347500 | transaction expiry, v3 transaction format |
| Sapling | 0x76b809bb | 419200 | Sapling spends and outputs, v4 transactions |
| Blossom | 0x2bb40e60 | 653600 | 75-second block target (halved from 150) |
| Heartwood | 0xf5b9230b | 903000 | shielded coinbase, ZIP-221 history MMR |
| Canopy | 0xe9ff75a6 | 1046400 | funding streams replace founders' reward |
| NU5 | 0xc2d6d0b4 | 1687104 | Orchard, v5 transactions, ZIP-244 txids |

Testnet and regtest heights differ; regtest activations are typically
overridable via `-nuparams=` for tests.

`ZFUTURE` is a placeholder for integration tests of unactivated rules.

## Network upgrade machinery

Read `src/consensus/upgrades.{h,cpp}` end to end. It is small and defines:

```cpp
NetworkUpgradeState(nHeight, params, idx) -> {DISABLED,PENDING,ACTIVE}
CurrentEpoch(nHeight, params)             -> UpgradeIndex
CurrentEpochBranchId(nHeight, params)     -> uint32_t
```

The branch ID is what gets put in `nConsensusBranchId` of every transaction
from Overwinter onward. It functions as a replay-protection tag: a v3+
transaction is bound to the consensus rules of a specific epoch and cannot
be replayed across a network upgrade.

Replay protection at NU boundaries also uses `nExpiryHeight` and the
version-group ID system (Overwinter introduced this; see `src/primitives/transaction.h`).

## The validation pipeline

This is the sequence of checks a block goes through, from "byte stream
arrives over the wire" to "becomes part of the active chain". Read in this
order in `src/main.cpp`:

```
ProcessNewBlock(state, chainparams, pfrom, pblock, fForceProcessing, dbp)
    AcceptBlockHeader     # add to header tree
    AcceptBlock           # write block file, contextual checks
        CheckBlock                       # noncontextual block checks
            CheckBlockHeader             # Equihash, target, time
            CheckTransaction (each tx)   # noncontextual tx checks
        ContextualCheckBlockHeader       # MTP, activation
        ContextualCheckBlock             # height, funding streams, etc.
    ActivateBestChain                    # may invoke fork resolution
        ConnectTip
            ConnectBlock                 # UTXO updates, script and proof
                CheckInputs              # double-spend, script eval
                # plus shielded checks: nullifier set, anchor lookup,
                # proof verification, binding signature, balance.
```

The two function pairs you must understand are:

- `CheckTransaction(tx, state, ...)` vs
  `ContextualCheckTransaction(tx, state, params, nHeight, ...)`
- `CheckBlock(...)` vs `ContextualCheckBlock(...)`

"Check" is height-independent: any node can run it on an isolated payload.
"ContextualCheck" depends on the height at which the block/tx is being
evaluated (which controls which NU rules apply, what the funding-stream
target is, whether expiry has passed, etc.).

### `ContextualCheckTransaction` walkthrough

Read this function (around `src/main.cpp:830`). It branches by the
height-active NU and enforces the per-NU rules:

- Overwinter must be active for `fOverwintered` to be set; conversely,
  `fOverwintered` must be set if Overwinter is active.
- Version-group ID must match the Overwinter/Sapling/NU5 group at the
  appropriate heights.
- Sapling tx version must be in `[4, OVERWINTER_MAX_TX_VERSION]` once
  Sapling is active and before NU5.
- Heartwood: shielded coinbase rules; coinbase outputs must decrypt to
  valid plaintext with `ovk = 0`.
- Canopy: funding-stream outputs must be present in coinbase at the right
  heights and addresses.
- NU5: v5 transactions, Orchard bundle rules.

Tying behaviour to height (not to a flag) is what makes the network
upgrade boundary deterministic.

### Coinbase rules

A coinbase transaction is the first transaction in a block; it has no
inputs except a coinbase, and creates the block subsidy plus fees as
outputs. Zcash adds:

- **Founders' reward.** Pre-Canopy: a fraction of the subsidy must be paid
  to a specific founder address (rotated through 48 addresses on a
  schedule). See `src/main.cpp` near "founders" and the historical
  `vFoundersRewardAddress` in `chainparams.cpp`.
- **Funding streams.** Canopy onward: replaces the founders' reward with
  one or more named streams (ECC, ZF, MGRC; the post-NU6 streams replace
  these). See `src/consensus/funding.{h,cpp}` and ZIP-207, ZIP-214.
- **Shielded coinbase.** Heartwood onward: coinbase can pay to a shielded
  address; outputs are constrained (must decrypt with all-zero `ovk` so
  that miners can prove the destination). See ZIP-213.
- **Maturity.** A coinbase output cannot be spent until 100 blocks have
  passed (`COINBASE_MATURITY`).
- **Shielding requirement.** Pre-Canopy, coinbase had to be shielded
  before being spent transparently. This rule was lifted at Canopy.

### `ConnectBlock` walkthrough

Once a block has passed both `CheckBlock` and `ContextualCheckBlock`, it
goes through `ConnectBlock` (read around `src/main.cpp:3500`). This is the
expensive part:

1. Validate that the previous-block hash matches the chain tip.
2. Apply each transaction's inputs and outputs to the `CCoinsViewCache`.
3. Run script verification on every input (cached against
   `script/sigcache.cpp`).
4. For each shielded bundle:
   - Sprout: verify JoinSplit proofs (`src/zcash/JoinSplit.cpp` ->
     librustzcash).
   - Sapling: verify spend proofs and output proofs, the binding
     signature; check spend authority signatures; check nullifiers
     against the nullifier set; check that the spend anchor exists in
     the Sapling note commitment tree at the spend's anchor depth.
   - Orchard: analogous, plus action proof and binding signature.
5. Update the note commitment trees (Sprout, Sapling, Orchard) with new
   commitments.
6. Update the nullifier sets.
7. Check funding-stream outputs and the block subsidy total.
8. Check the Merkle root in the block header matches the
   transactions, and that the witness/auth-data roots
   (`hashSaplingRoot`, `hashAuthDataRoot`, `hashChainHistoryRoot`)
   match per the activation epoch's rules.
9. Write block index updates.

For Sapling and Orchard proofs, zcashd uses a **batch validator**: instead
of verifying each proof immediately, the C++ side accumulates them and
delegates to a single Rust batch verification at the end of the block.
This is in `src/rust/src/sapling.rs` and `src/rust/src/orchard_ffi.rs`.

## Difficulty adjustment

Zcash uses a windowed difficulty algorithm (not Bitcoin's epoch-based
retarget). Read `src/pow.cpp::GetNextWorkRequired`. It looks at the last
`nPowAveragingWindow` blocks and adjusts toward the target spacing, with
dampening (`/4` of the deviation). Post-Blossom the target spacing is
75 seconds; before Blossom it was 150 seconds.

`src/pow.cpp::CheckEquihashSolution` validates the Equihash PoW. The
algorithm parameters are `(n, k) = (200, 9)` for mainnet/testnet and
`(48, 5)` for regtest.

## ZIPs that are consensus

These are the ZIPs that touch consensus and are implemented in this
codebase. Read the ZIPs alongside the code:

- ZIP-32: hierarchical deterministic shielded keys (Sapling, Orchard).
- ZIP-143, ZIP-243, ZIP-244, ZIP-225: transaction sighash and txid for
  Overwinter / Sapling / NU5 / Orchard.
- ZIP-200, ZIP-201, ZIP-202: network upgrade mechanism, version groups,
  ascending tx versions.
- ZIP-203: transaction expiry.
- ZIP-205, ZIP-206: pool-specific dust thresholds.
- ZIP-207: funding streams.
- ZIP-208: 75-second block targets (Blossom).
- ZIP-209: turnstile enforcement on shielded pools.
- ZIP-210: shielded coinbase change rules.
- ZIP-211: disable post-Sprout addition to Sprout pool.
- ZIP-212: enforce note plaintext leadByte (`R^Sapling` consistency).
- ZIP-213: shielded coinbase.
- ZIP-214: post-Canopy funding-stream addresses.
- ZIP-215: Ed25519 verification (no malleability).
- ZIP-216: requiring canonical Jubjub element encodings.
- ZIP-221: history MMR (Heartwood).
- ZIP-222: replay protection on transparent transactions.
- ZIP-225: v5 transaction format.
- ZIP-244: NU5 transaction digests.
- ZIP-252: deployment of NU5.
- ZIP-316: unified addresses and viewing keys.

Newer ZIPs (NU6+) are not yet activated in this codebase. Check
https://zips.z.cash/ for the current set and `git log src/consensus/` to
see what has been implemented.

## Testing consensus changes

Three test layers:

1. **Unit tests in `src/gtest/`** for self-contained logic, e.g.
   `test_checkblock.cpp`, `test_checktransaction.cpp`,
   `test_consensus.cpp`, `test_foundersreward.cpp`, `test_pow.cpp`.
2. **RPC tests in `qa/rpc-tests/`** for end-to-end behaviour against a
   running regtest network, e.g. `mempool_nu_activation.py`,
   `hardforkdetection.py`, `feature_zip244_blockcommitments.py`.
3. **Cross-implementation diff tests** with zebra. ECC historically ran
   diff tests; ZODL will need to keep doing some version of this.

Any consensus change MUST come with tests that exercise the new rule
at activation, just before activation, and after activation.

## Pitfalls specific to consensus work

- **Branch IDs are not arbitrary.** Each is a magic value chosen for the
  ZIP. Do not invent new ones without coordinating with the ZIP process.
- **Activation heights are immutable once shipped.** Mainnet activation
  heights cannot be changed after deployment without a network split.
  Testnet heights have historically been changed (because testnet has
  been reset), but follow the same care.
- **`fOverwintered` is consensus.** It is not just a flag; it gates the
  meaning of every other field in the transaction.
- **Sighash changes are subtle.** A wrong byte in the sighash personalisation
  string makes every signature in the network invalid.
- **The history tree is fragile.** ZIP-221 specifies an exact MMR shape;
  zcashd's history is in `src/zcash/History.cpp` and the underlying tree
  is `zcash_history` in Rust. Both must agree.
- **You cannot easily roll back.** A counterfeiting bug in a shielded
  pool may not be observable from the chain. The SECURITY.md document
  spells out why this means disclosure is handled with extra care.
