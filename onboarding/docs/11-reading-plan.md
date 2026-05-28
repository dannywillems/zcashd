---
sidebar_position: 11
title: "Reading plan: six weeks"
description: "A six-week, full-time, hands-on reading plan that converges on a real merged pull request."
---

# Reading plan: six weeks

## 1. Why this chapter exists

This is a structured plan for the first six weeks of full-time
onboarding. It is intentionally heavy on building, running, and
instrumenting the node, not just reading code. The exercises matter
more than the reading.

Adapt to background. If the reader already knows Bitcoin Core well,
compress weeks 1 - 2. If zk-SNARKs are new, expand weeks 4 - 5.

## 2. Definitions

**Definition 10.1 (Active reading).** Reading combined with a
hands-on artefact produced by the reader: a notes file, a patch, a
test, or a trace from `debug.log`.

**Definition 10.2 (Output).** A file in `~/codes/zcashd-onboarding/`
(or wherever the reader keeps notes) named `weekN.md` that contains
the artefacts for that week. The output is the unit of accountability.

## 3. The plan

### Week 1: bring the node up

**Reading:**

- [Chapter 01](./01-context-and-history.md): context.
- [Chapter 02](./02-build-system.md): build system.
- [README.md](https://github.com/zcash/zcash/blob/v5.5.0-rc1/README.md),
  [SECURITY.md](https://github.com/zcash/zcash/blob/v5.5.0-rc1/SECURITY.md),
  [doc/release-process.md](https://github.com/zcash/zcash/blob/v5.5.0-rc1/doc/release-process.md).
- Skim the [Zcash Protocol Specification](https://zips.z.cash/protocol/protocol.pdf)
  table of contents.

**Doing:**

1. Build `zcashd` from `master` on the dev machine end-to-end.
2. Run it against testnet, sync to the tip. Note how long sync
   takes, what dominates CPU and disk.
3. Run `zcash-cli getinfo`, `getblockchaininfo`, `getnetworkinfo`,
   `getpeerinfo`. Read each field of the output until each is
   understood.
4. Read
   [src/init.cpp::AppInit2](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/init.cpp)
   line by line. Map each call to a subsystem.
5. Trace the start of one peer connection in `debug.log` with
   `-debug=net`.
6. Build with `-DDEBUG_LOCKORDER` to learn the lock topology
   experimentally.

**Output:** `week1.md` listing the subsystems seen at startup, in
order, with file:line references.

### Week 2: consensus structure

**Reading:**

- [Chapter 03](./03-code-organization.md): code organization.
- [Chapter 04](./04-consensus.md): consensus.
- Protocol Specification sections 3 and 6.
- [ZIP-200](https://zips.z.cash/zip-0200),
  [ZIP-201](https://zips.z.cash/zip-0201),
  [ZIP-202](https://zips.z.cash/zip-0202) (network upgrades).
- [ZIP-203](https://zips.z.cash/zip-0203) (transaction expiry).
- [src/consensus/params.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/consensus/params.h),
  [src/consensus/upgrades.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/consensus/upgrades.cpp),
  [src/consensus/funding.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/consensus/funding.cpp)
  in full.
- The three `CChainParams` classes in
  [src/chainparams.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/chainparams.cpp).

**Doing:**

1. Read `ProcessNewBlock` to `AcceptBlock` to `ConnectBlock` in
   [src/main.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/main.cpp)
   (in that order; do not get distracted).
2. Read `CheckTransaction` and `ContextualCheckTransaction` in full.
3. Pick one ZIP that has been implemented (e.g.
   [ZIP-244](https://zips.z.cash/zip-0244)) and trace how it touches
   the codebase. Use `grep`/`rg` aggressively.
4. Run
   [qa/rpc-tests/mempool_nu_activation.py](https://github.com/zcash/zcash/blob/v5.5.0-rc1/qa/rpc-tests/mempool_nu_activation.py)
   under `--nocleanup` and read every step.
5. Write a one-pager on the funding-stream mechanism, with file:line
   references.

**Output:** `week2.md` mapping each NU to the files it modified.

### Week 3: P2P and storage

**Reading:**

- [Chapter 05](./05-p2p-networking.md): P2P.
- [Bitcoin Core developer notes on P2P](https://github.com/bitcoin/bitcoin/blob/master/doc/p2p-overview.md).
- [src/net.{h,cpp}](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/net.h),
  [src/addrman.{h,cpp}](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/addrman.h),
  [src/protocol.{h,cpp}](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/protocol.h).
- Skim `ProcessMessage` in
  [src/main.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/main.cpp).
- LevelDB intro (`leveldb` README).

**Doing:**

1. Run a node with `-debug=net -debug=mempool -debug=bench` and
   document one block being received and connected.
2. Patch the node to count how many bytes per peer per minute are
   received and write a small report.
3. Read `CCoinsViewCache` and trace how a transparent UTXO becomes
   a coin in the UTXO set.
4. Read
   [src/dbwrapper.{h,cpp}](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/dbwrapper.h)
   and look at the on-disk LevelDB layout under
   `~/.zcash/blocks/index/` and `~/.zcash/chainstate/`.

**Output:** `week3.md` describing one full message round-trip
(handshake to headers to blocks to a transaction to mempool
insertion).

### Week 4: cryptography

**Reading:**

- [Chapter 06](./06-cryptography.md): cryptography.
- Equihash paper (Biryukov, Khovratovich, NDSS 2016).
- BLAKE2 paper (or RFC 7693).
- Section 5 of the Zcash Protocol Specification.
- [src/crypto/sha256.{h,cpp}](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/crypto/sha256.h),
  [src/crypto/equihash.{h,cpp,tcc}](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/crypto/equihash.h).
- [src/rust/src/blake2b.rs](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/blake2b.rs),
  [src/rust/src/ed25519.rs](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/ed25519.rs).

**Doing:**

1. Write a tiny Rust program that BLAKE2b-personalises bytes the way
   zcashd does and reproduce a known sighash from a testnet
   transaction.
2. Trace an Equihash solution verification through
   `CheckEquihashSolution` and pinpoint where the BLAKE2 personalised
   keying happens.
3. Patch
   [src/script/sigcache.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/script/sigcache.cpp)
   to print cache hit/miss statistics and confirm that mempool
   acceptance prevents redundant block verification.
4. Add a microbenchmark in
   [src/bench/](https://github.com/zcash/zcash/tree/v5.5.0-rc1/src/bench)
   for SHA-256 throughput and compare AVX2/SSE4 paths.

**Output:** `week4.md` with one sighash worked out by hand,
byte by byte.

### Week 5: zk-SNARKs and shielded pools

**Reading:**

- [Chapter 07](./07-zk-proofs-and-pools.md).
- Sapling spec (sections 4.1 - 4.7 of the Protocol Spec).
- [Orchard book](https://zcash.github.io/orchard/).
- [Halo 2 book](https://zcash.github.io/halo2/), introductory
  chapters.
- [src/rust/src/sapling.rs](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/sapling.rs),
  [src/rust/src/orchard_ffi.rs](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/orchard_ffi.rs).

**Doing:**

1. Read the Sapling batch validator in
   [src/rust/src/sapling.rs](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/sapling.rs)
   and `zcash_proofs::sapling::BatchValidator`. Add log lines to see
   batch sizes during testnet sync.
2. Construct one Sapling transaction on regtest using
   `z_sendmany`, inspect it with `zcash-inspect`, and identify
   every field: each spend, output, value commitment, the binding
   signature.
3. Do the same for Orchard.
4. Read the upstream
   [orchard crate's circuit module](https://github.com/zcash/orchard/tree/main/src/circuit)
   and identify the columns and the custom gates. Skim, do not
   memorise.

**Output:** `week5.md` annotating one full v5 transaction
byte-by-byte.

### Week 6: wallet, RPC, and the first patch

**Reading:**

- [Chapter 09](./09-wallet-and-rpc.md).
- [Chapter 10](./10-testing.md).
- [src/wallet/wallet.{h,cpp}](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/wallet/wallet.h)
  (skim; large).
- [src/wallet/wallet_tx_builder.{h,cpp}](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/wallet/wallet_tx_builder.h)
  (read carefully).
- The RPC reference (`zcash-cli help`).

**Doing:**

1. Pick a small open issue from
   [zcash/zcash issues](https://github.com/zcash/zcash/issues) (or a
   small improvement noticed in passing: a missing log line, a TODO
   comment, a typo in an error message). Write a patch with a test.
2. Run the full test suite
   ([qa/zcash/full_test_suite.py](https://github.com/zcash/zcash/blob/v5.5.0-rc1/qa/zcash/full_test_suite.py));
   make sure the patch leaves it green.
3. Submit the patch and follow the review.
4. Read three recent merged PRs (any size, any subsystem) and study
   how they look as code, how the tests work, what the reviewer
   asked about.

**Output:** a merged or in-review PR.

### After week 6

A reader who completes the plan should be able to:

- Build and run zcashd on demand.
- Trace any feature from spec to code to test.
- Modify any subsystem with appropriate caution.
- Read the protocol spec without translation overhead.

The next stage is depth in one or two areas of choice. For a
principal cryptography engineer the natural specialisations are:

- Orchard, Halo 2, and post-NU5 cryptographic work (likely focus
  given ZSAs and future shielded pool features).
- Wallet scanning performance and the move to a Rust-native wallet.
- A migration path for the Sprout pool.
- Test infrastructure: bringing fuzzing, differential testing, and
  property-based testing into routine CI.
- Reproducible builds: replacing or modernising the Gitian pipeline.

Pick one and dig.

### Suggested daily/weekly rhythm

- Mornings: read code with a notebook open, write down questions.
- Afternoons: run the node, instrument it, write small patches that
  answer the morning's questions.
- One day per week: read upstream
  [librustzcash](https://github.com/zcash/librustzcash) and
  [orchard](https://github.com/zcash/orchard) crates, follow recent
  merged PRs there.
- Fridays: write a short summary (one page) of what was learned.
- Mondays: review the previous Friday's summary and pick the week's
  goals.

Six weeks of this is enough to be productive. Twelve weeks is enough
to be confident in any single area. Eighteen months is enough to be
the person other people ask.

## 4. Failure modes

- **Reading without running.** The codebase is too big to be
  understood without an instrumented node. Caught by: the reader's
  own confusion.
- **Skipping the build week.** Without a working build, every other
  exercise is hypothetical.
- **Treating the week as a checklist instead of a budget.** A week
  is an estimate; if a week takes ten days, take ten days.
- **Submitting the week-6 PR without running the full suite.** Most
  PR-revision cycles come from missing tests. Run
  `qa/zcash/full_test_suite.py` locally first.

## 5. Spec pointers

The reading plan is internal scaffolding. The pointers below are
external authorities for the topics in the plan:

- [Zcash Protocol Specification](https://zips.z.cash/protocol/protocol.pdf).
- [ZIPs index](https://zips.z.cash/).
- [librustzcash](https://github.com/zcash/librustzcash).
- [orchard](https://github.com/zcash/orchard).

## 6. Exercises

The plan is itself a series of exercises. The minimal version,
distilled:

1. **Build.** Get `src/zcashd` to start and sync testnet.
2. **Map.** Produce a startup subsystem trace from `debug.log`.
3. **Trace.** Walk one transaction from `getrawtransaction` JSON
   back to its bytes on disk.
4. **Patch.** Open one merged or in-review PR on `zcash/zcash`.

If a reader completes all four in six weeks, they are on schedule.

## 7. Further reading

- The Zcash Foundation's published Arborist meeting minutes for
  the actual cadence of protocol-level discussion among the
  implementers.
- The
  [librustzcash CHANGELOG](https://github.com/zcash/librustzcash/blob/main/CHANGELOG.md)
  to follow the cryptographic crates' evolution.
