---
sidebar_position: 4
title: "Consensus"
description: "The validation pipeline, network upgrade machinery, branch IDs, and where consensus lives in src/main.cpp and src/consensus/."
---

# Consensus

## 1. Why this chapter exists

Consensus is everything a fully-validating node must agree on
byte-for-byte with every other validating node. Disagreement is a
chain split. In zcashd, consensus lives in three places:

- `src/consensus/` (parameters and network-upgrade tables)
- `src/main.cpp` (the validation pipeline)
- the Rust verifier crates called via `src/rust/src/*_ffi.rs`

The canonical specification of consensus is the
[Zcash Protocol Specification](https://zips.z.cash/protocol/protocol.pdf).
The [ZIPs index](https://zips.z.cash/) lists every protocol-level
decision. Read both alongside the code; consensus PRs are rejected
without a ZIP anchor.

## 2. Definitions

**Definition 4.1 (Consensus rule).** A predicate on a block or
transaction (possibly relative to chain state at a given height) that
every validating node MUST evaluate identically. A consensus rule is
one of:

1. A structural check on the wire form (length, version, field
   ordering). Implemented in serialisation and `Check*` functions.
2. A predicate on a block or tx in isolation (`CheckTransaction`,
   `CheckBlock`). No chain state needed.
3. A predicate that depends on chain state at a specific height
   (`ContextualCheckTransaction`, `ContextualCheckBlock`,
   `ContextualCheckBlockHeader`). Activation rules, expiry, funding
   streams.
4. A predicate that depends on the UTXO set (`ConnectBlock`,
   `CheckInputs`). Double-spend protection, script execution,
   shielded nullifier and anchor checks.
5. A cryptographic check on a proof or signature
   (`proof_verifier.cpp` and Rust batch validators).

**Definition 4.2 (Network upgrade, NU).** A scheduled change to the
consensus rules, activated at a specific height $h_{\mathsf{NU}}$.
The protocol is parameterised by a sequence
$(h_{\mathsf{Overwinter}}, h_{\mathsf{Sapling}}, \ldots, h_{\mathsf{NU5}})$
with $h_i < h_{i+1}$. At height $h$, the active epoch is
$\mathsf{Epoch}(h) = \max\{i : h_i \le h\}$.

**Definition 4.3 (Branch ID).** A 32-bit identifier
$\mathsf{branch}_i \in \{0,1\}^{32}$ uniquely associated with each
epoch $i$. Every transaction from Overwinter onward carries
$\mathsf{branch}_{\mathsf{Epoch}(h_{\mathsf{tx}})}$ in its
`nConsensusBranchId` field. This binds a transaction to one epoch and
prevents replay across hard forks.

**Definition 4.4 (Consensus parameters).** The struct
`Consensus::Params` (one per network: mainnet, testnet, regtest)
fixes every consensus-relevant numeric and address constant.
Instantiated in `src/chainparams.cpp` per network.

**Invariant 4.5 (Determinism).** For any block $B$ at height $h$
and any two validating nodes $N_1, N_2$ with the same `Consensus::Params`,
$N_1$ accepts $B$ iff $N_2$ accepts $B$. Any code path with non-determinism
at consensus depth is a critical bug.

## 3. The code

### Consensus parameters

`src/consensus/params.h` defines `Consensus::Params`. Large struct.
Key fields:

- `hashGenesisBlock`
- `nSubsidySlowStartInterval`, `nPreBlossomSubsidyHalvingInterval`,
  `nPostBlossomSubsidyHalvingInterval`
- `nMajorityEnforceBlockUpgrade`, `nMajorityRejectBlockOutdated`
- `powLimit`, `nPowAveragingWindow`, `nPowMaxAdjustDown`,
  `nPowMaxAdjustUp`, `nPreBlossomPowTargetSpacing`,
  `nPostBlossomPowTargetSpacing`
- `fPowAllowMinDifficultyBlocksAfterHeight`
- `vUpgrades[MAX_NETWORK_UPGRADES]` (the activation table)
- `vFundingStreams[MAX_FUNDING_STREAMS]` (post-Canopy block-reward
  distribution; see ZIP-207, ZIP-214)
- `nFundingPeriodLength`

```cpp reference title="src/consensus/params.h (Consensus::Params, declarations)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/consensus/params.h#L100-L200
```

The three classes in `src/chainparams.cpp` instantiate
`Consensus::Params`:

```cpp
class CMainParams    : public CChainParams { ... };
class CTestNetParams : public CChainParams { ... };
class CRegTestParams : public CChainParams { ... };
```

For mainnet, the activation heights are listed in
[chapter 01](./01-context-and-history.md#network-upgrades).
Testnet and regtest heights differ; regtest activations are
typically overridable via `-nuparams=` for tests.

### Network upgrade machinery

Read [src/consensus/upgrades.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/consensus/upgrades.cpp)
end to end. Small file. Defines:

```cpp
NetworkUpgradeState(nHeight, params, idx) -> {DISABLED,PENDING,ACTIVE}
CurrentEpoch(nHeight, params)             -> UpgradeIndex
CurrentEpochBranchId(nHeight, params)     -> uint32_t
```

```cpp reference title="src/consensus/upgrades.cpp (CurrentEpochBranchId)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/consensus/upgrades.cpp#L40-L100
```

The branch ID is what gets put in `nConsensusBranchId` of every
transaction from Overwinter onward. It functions as a replay-protection
tag.

Replay protection at NU boundaries also uses `nExpiryHeight` and the
version-group ID system (Overwinter introduced this; see
`src/primitives/transaction.h`).

### The validation pipeline

Sequence of checks for a block arriving over the wire to becoming
part of the active chain. Read in this order in `src/main.cpp`:

```
ProcessNewBlock(state, chainparams, pfrom, pblock, fForceProcessing, dbp)
    AcceptBlockHeader              # add to header tree
    AcceptBlock                    # write block file, contextual checks
        CheckBlock                 # noncontextual block checks
            CheckBlockHeader       # Equihash, target, time
            CheckTransaction       # noncontextual tx checks (each tx)
        ContextualCheckBlockHeader # MTP, activation
        ContextualCheckBlock       # height, funding streams, etc.
    ActivateBestChain              # may invoke fork resolution
        ConnectTip
            ConnectBlock           # UTXO updates, script and proof
                CheckInputs        # double-spend, script eval
                # plus shielded checks: nullifier set, anchor lookup,
                # proof verification, binding signature, balance.
```

The two function pairs to understand:

- `CheckTransaction(tx, state, ...)` vs
  `ContextualCheckTransaction(tx, state, params, nHeight, ...)`
- `CheckBlock(...)` vs `ContextualCheckBlock(...)`

"Check" is height-independent: any node can run it on an isolated
payload. "ContextualCheck" depends on the height at which the block/tx
is evaluated (which controls which NU rules apply, the funding-stream
target, whether expiry has passed, etc.).

### `ContextualCheckTransaction` walkthrough

```cpp reference title="src/main.cpp (ContextualCheckTransaction prologue)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/main.cpp#L820-L920
```

Branches by the height-active NU and enforces per-NU rules:

- Overwinter must be active for `fOverwintered` to be set; conversely,
  `fOverwintered` must be set if Overwinter is active.
- Version-group ID must match the Overwinter/Sapling/NU5 group at the
  appropriate heights.
- Sapling tx version must be in `[4, OVERWINTER_MAX_TX_VERSION]` once
  Sapling is active and before NU5.
- Heartwood: shielded coinbase rules; coinbase outputs must decrypt
  to valid plaintext with `ovk = 0`.
- Canopy: funding-stream outputs must be present in coinbase at the
  right heights and addresses.
- NU5: v5 transactions, Orchard bundle rules.

Tying behaviour to height (not to a flag) is what makes the network
upgrade boundary deterministic.

### Coinbase rules

A coinbase transaction is the first transaction in a block; it has
no inputs except a coinbase, and creates the block subsidy plus fees
as outputs. Zcash adds:

- **Founders' reward.** Pre-Canopy: a fraction of the subsidy must
  be paid to a specific founder address (rotated through 48
  addresses).
- **Funding streams.** Canopy onward: replaces the founders' reward
  with one or more named streams (ECC, ZF, MGRC; the post-NU6
  streams replace these). See `src/consensus/funding.{h,cpp}` and
  ZIP-207, ZIP-214.
- **Shielded coinbase.** Heartwood onward: coinbase can pay to a
  shielded address; outputs are constrained (must decrypt with
  all-zero `ovk`). See ZIP-213.
- **Maturity.** A coinbase output cannot be spent until 100 blocks
  have passed (`COINBASE_MATURITY`).
- **Shielding requirement.** Pre-Canopy, coinbase had to be
  shielded before being spent transparently. This rule was lifted
  at Canopy.

### `ConnectBlock` walkthrough

```cpp reference title="src/main.cpp (ConnectBlock entry)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/main.cpp#L3500-L3600
```

Once a block has passed both `CheckBlock` and
`ContextualCheckBlock`, it goes through `ConnectBlock`. Expensive
part:

1. Validate that the previous-block hash matches the chain tip.
2. Apply each transaction's inputs and outputs to the
   `CCoinsViewCache`.
3. Run script verification on every input (cached against
   `script/sigcache.cpp`).
4. For each shielded bundle:
   - Sprout: verify JoinSplit proofs (`src/zcash/JoinSplit.cpp` to
     librustzcash).
   - Sapling: verify spend proofs and output proofs, the binding
     signature; check spend authority signatures; check nullifiers
     against the nullifier set; check that the spend anchor exists
     in the Sapling note commitment tree at the spend's anchor
     depth.
   - Orchard: analogous, plus action proof and binding signature.
5. Update the note commitment trees (Sprout, Sapling, Orchard) with
   new commitments.
6. Update the nullifier sets.
7. Check funding-stream outputs and the block subsidy total.
8. Check the Merkle root in the block header matches the
   transactions, and that the witness/auth-data roots
   (`hashSaplingRoot`, `hashAuthDataRoot`, `hashChainHistoryRoot`)
   match per the activation epoch's rules.
9. Write block index updates.

For Sapling and Orchard proofs, zcashd uses a **batch validator**:
the C++ side accumulates them and delegates to a single Rust batch
verification at the end of the block. This is in
`src/rust/src/sapling.rs` and `src/rust/src/orchard_ffi.rs`.

### Difficulty adjustment

Zcash uses a windowed difficulty algorithm (not Bitcoin's
epoch-based retarget).

```cpp reference title="src/pow.cpp (GetNextWorkRequired)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/pow.cpp#L1-L70
```

It looks at the last `nPowAveragingWindow` blocks and adjusts
toward the target spacing, with damping ($1/4$ of the deviation).
Post-Blossom the target spacing is 75 seconds; before Blossom it
was 150 seconds.

`CheckEquihashSolution` validates the Equihash PoW:

```cpp reference title="src/pow.cpp (CheckEquihashSolution)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/pow.cpp#L150-L210
```

Parameters: $(n, k) = (200, 9)$ for mainnet/testnet,
$(n, k) = (48, 5)$ for regtest.

### ZIPs that are consensus

These ZIPs touch consensus and are implemented in this codebase.
Read each alongside the relevant code:

- ZIP-32: hierarchical deterministic shielded keys.
- ZIP-143, ZIP-243, ZIP-244, ZIP-225: transaction sighash and txid
  for Overwinter / Sapling / NU5 / Orchard.
- ZIP-200, ZIP-201, ZIP-202: network upgrade mechanism, version
  groups, ascending tx versions.
- ZIP-203: transaction expiry.
- ZIP-205, ZIP-206: pool-specific dust thresholds.
- ZIP-207: funding streams.
- ZIP-208: 75-second block targets (Blossom).
- ZIP-209: turnstile enforcement on shielded pools.
- ZIP-210: shielded coinbase change rules.
- ZIP-211: disable post-Sprout addition to Sprout pool.
- ZIP-212: enforce note plaintext `leadByte` (`R^{Sapling}` consistency).
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
[zips.z.cash](https://zips.z.cash/) for the current set and
`git log src/consensus/` for what has been implemented.

### Testing consensus changes

Three test layers:

1. **Unit tests in `src/gtest/`** for self-contained logic, e.g.
   `test_checkblock.cpp`, `test_checktransaction.cpp`,
   `test_consensus.cpp`, `test_foundersreward.cpp`,
   `test_pow.cpp`.
2. **RPC tests in `qa/rpc-tests/`** for end-to-end behaviour
   against a running regtest network, e.g.
   `mempool_nu_activation.py`, `hardforkdetection.py`,
   `feature_zip244_blockcommitments.py`.
3. **Cross-implementation diff tests** with zebra. ECC historically
   ran diff tests; ZODL will need to keep doing some version of
   this.

Any consensus change MUST come with tests that exercise the new
rule at activation, just before activation, and after activation.

## 4. Failure modes

- **Branch IDs are not arbitrary.** Each is a magic value chosen for
  the ZIP. Do not invent new ones without coordinating with the ZIP
  process. Caught by: review only; activated chains will reject
  transactions with wrong branch IDs.
- **Activation heights are immutable once shipped.** Mainnet
  activation heights cannot be changed after deployment without a
  network split. Testnet heights have historically been changed
  (because testnet has been reset). Caught by: cross-implementation
  diff.
- **`fOverwintered` is consensus.** It is not just a flag; it gates
  the meaning of every other field in the transaction. Caught by:
  `src/gtest/test_checktransaction.cpp`.
- **Sighash changes are subtle.** A wrong byte in the sighash
  personalisation string makes every signature in the network
  invalid. Caught by: `src/gtest/test_checktransaction.cpp` (and
  reality, on first test peer connection).
- **The history tree is fragile.** ZIP-221 specifies an exact MMR
  shape; zcashd's history is in `src/zcash/History.cpp` and the
  underlying tree is `zcash_history` in Rust. Both must agree.
  Caught by: `src/gtest/test_history.cpp`.
- **You cannot easily roll back.** A counterfeiting bug in a
  shielded pool may not be observable from the chain (Sprout
  CVE-2019-7167). The SECURITY.md document spells out why this means
  disclosure is handled with extra care. No automated test; caught
  by audit only.

## 5. Spec pointers

- [Zcash Protocol Specification, section 6 (Concrete Protocol)](https://zips.z.cash/protocol/protocol.pdf):
  the consensus rules in normative form.
- [ZIP-200](https://zips.z.cash/zip-0200): the network upgrade mechanism.
- [ZIP-244](https://zips.z.cash/zip-0244): NU5 transaction digests.
- [ZIP-225](https://zips.z.cash/zip-0225): v5 transaction format.

## 6. Exercises

1. **Branch-ID lookup.** Open
   [src/consensus/upgrades.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/consensus/upgrades.cpp)
   and identify the branch ID for Canopy. Confirm it matches the
   ZIP-251 / ZIP-252 deployment notes.

2. **Trace an activation.** On regtest, set `-nuparams=2bb40e60:10`
   to force Blossom activation at height 10, mine 11 blocks, and
   confirm `getblockchaininfo` reports Blossom as active.

3. **Read CheckTransaction.** Open `src/main.cpp`, find
   `CheckTransaction`, and list every per-NU branch it contains.
   Answer is keyed by `IsConsensusBranchIdValid`,
   `IsOverwinterActive`, `IsSaplingActive`, etc.

4. **Modification exercise.** Add a per-block invariant log line at
   the end of `ConnectBlock` that prints
   `(height, branchId, sapling_root, orchard_root)` to `debug.log`
   under `-debug=bench`. Confirm on regtest that the values evolve
   sensibly across NU5 activation. Then run
   `qa/rpc-tests/feature_zip244_blockcommitments.py` and observe the
   roots.

## 7. Further reading

- The Zcash Protocol Specification cover-to-cover.
- Daira Hopwood's commentary on ZIP design (search ZIP author lists
  for Daira; rationale is dense and clarifies design choices).
- The Zcash Foundation Arborist meeting minutes for the NU5 design
  process.
