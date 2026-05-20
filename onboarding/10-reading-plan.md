# 10 - A six-week reading plan

This is a structured plan for the first six weeks of full-time onboarding.
It is intentionally heavy on building, running, and instrumenting the
node, not just reading code. The exercises matter more than the reading.

Adapt to your background. If you already know Bitcoin Core well, compress
weeks 1-2. If you are new to zk-SNARKs, expand weeks 4-5.

## Week 1: bring the node up

**Reading**:
- Chapter 01 (context).
- Chapter 02 (build system).
- README.md, SECURITY.md, doc/release-process.md.
- Skim the Zcash Protocol Specification table of contents.

**Doing**:

1. Build `zcashd` from `master` on your dev machine end-to-end.
2. Run it against testnet, sync to the tip. Note how long sync takes,
   what dominates CPU and disk.
3. Run `zcash-cli getinfo`, `getblockchaininfo`, `getnetworkinfo`,
   `getpeerinfo`. Read each field of the output until you know what it
   means.
4. Read `src/init.cpp::AppInit2` line by line. Map each call to a
   subsystem.
5. Trace the start of one peer connection in `debug.log` with
   `-debug=net`.
6. Build with `-DDEBUG_LOCKORDER` to learn the lock topology
   experimentally.

**Output**: a short personal notes file (`week1.md`) listing the
subsystems you saw start up, in order, with file:line references.

## Week 2: consensus structure

**Reading**:
- Chapter 03 (code organization).
- Chapter 04 (consensus).
- Protocol Specification sections 3 and 6.
- ZIP-200, ZIP-201, ZIP-202 (network upgrades).
- ZIP-203 (transaction expiry).
- `src/consensus/params.h`, `upgrades.cpp`, `funding.cpp` in full.
- The three `CChainParams` classes in `src/chainparams.cpp`.

**Doing**:

1. Read `ProcessNewBlock` -> `AcceptBlock` -> `ConnectBlock` in
   `src/main.cpp` (in that order, do not get distracted).
2. Read `CheckTransaction` and `ContextualCheckTransaction` in full.
3. Pick one ZIP that has been implemented (e.g. ZIP-244) and trace
   how it touches the codebase. Use `grep`/`rg` aggressively.
4. Run the `qa/rpc-tests/mempool_nu_activation.py` test under
   `--nocleanup` and read every step.
5. Write a one-pager on the funding stream mechanism, with file:line
   references.

**Output**: `week2.md` mapping each NU to the files it modified.

## Week 3: P2P and storage

**Reading**:
- Chapter 05 (P2P).
- Bitcoin Core developer notes on P2P
  (`https://github.com/bitcoin/bitcoin/blob/master/doc/p2p-overview.md`).
- `src/net.{h,cpp}`, `src/addrman.{h,cpp}`, `src/protocol.{h,cpp}`.
- Skim `ProcessMessage` in `src/main.cpp`.
- LevelDB intro (`leveldb` README).

**Doing**:

1. Run a node with `-debug=net -debug=mempool -debug=bench` and
   document one block being received and connected.
2. Patch the node to count how many bytes per peer per minute are
   received and write a small report.
3. Read `CCoinsViewCache` and trace how a transparent UTXO becomes a
   coin in the UTXO set.
4. Read `src/dbwrapper.{h,cpp}` and look at the on-disk LevelDB
   layout under `~/.zcash/blocks/index/` and `~/.zcash/chainstate/`.

**Output**: `week3.md` describing one full message round-trip
(handshake -> headers -> blocks -> a transaction -> mempool insertion).

## Week 4: cryptography

**Reading**:
- Chapter 06 (cryptography).
- Equihash paper.
- BLAKE2 paper (or the RFC).
- The "Primitives" chapter of the Zcash Protocol Specification (5).
- `src/crypto/sha256.{h,cpp}`, `src/crypto/equihash.{h,cpp,tcc}`.
- `src/rust/src/blake2b.rs`, `src/rust/src/ed25519.rs`.

**Doing**:

1. Write a tiny Rust program that BLAKE2b-personalises bytes the way
   zcashd does and reproduce a known sighash from a testnet
   transaction.
2. Trace an Equihash solution verification through
   `CheckEquihashSolution` and pinpoint where the BLAKE2 personalised
   keying happens.
3. Patch `src/script/sigcache.cpp` to print cache hit/miss statistics
   and confirm that mempool acceptance prevents redundant block
   verification.
4. Add a microbenchmark in `src/bench/` for SHA-256 throughput and
   compare AVX2/SSE4 paths.

**Output**: `week4.md` with one sighash worked out by hand, byte by
byte.

## Week 5: zk-SNARKs and shielded pools

**Reading**:
- Chapter 07.
- Sapling spec (sections 4.1-4.7 of Zcash Protocol Spec).
- Orchard book (`https://zcash.github.io/orchard/`).
- Halo 2 book (`https://zcash.github.io/halo2/`), the introductory
  chapters.
- `src/rust/src/sapling.rs`, `src/rust/src/orchard_*.rs`.

**Doing**:

1. Read the Sapling batch validator in `src/rust/src/sapling.rs` and
   `zcash_proofs::sapling::BatchValidator`. Add log lines to see
   batch sizes during testnet sync.
2. Construct one Sapling transaction on regtest using `z_sendmany`,
   inspect it with `zcash-inspect`, and identify every field: each
   spend, output, value commitment, the binding signature.
3. Do the same for Orchard.
4. Read the upstream `orchard` crate's circuit module and identify
   the columns and the custom gates. You do not need to understand
   every gate, just the rough shape of a Plonkish layout.

**Output**: `week5.md` annotating one full v5 transaction byte-by-byte.

## Week 6: wallet, RPC, and your first patch

**Reading**:
- Chapter 08.
- Chapter 09.
- `src/wallet/wallet.{h,cpp}` (skim; it is large).
- `src/wallet/wallet_tx_builder.{h,cpp}` (read carefully).
- The RPC reference (`zcash-cli help`).

**Doing**:

1. Pick a small open issue from the issue tracker (or a small
   improvement you noticed: a missing log line, a TODO comment, a
   typo in an error message). Write a patch with a test.
2. Run the full test suite (`qa/zcash/full_test_suite.py`); make
   sure your patch leaves it green.
3. Submit the patch and follow the review.
4. Read three recent merged PRs (any size, any subsystem) and study
   how they look as code, how the tests work, what the reviewer
   asked about.

**Output**: a merged or in-review PR.

## After week 6

You should now be able to:

- Build and run zcashd on demand.
- Trace any feature from spec to code to test.
- Modify any subsystem with appropriate caution.
- Read the protocol spec without translation overhead.

The next stage is depth in one or two areas of your choice. For a
principal cryptography engineer the natural specialisations are:

- Orchard, Halo 2, and post-NU5 cryptographic work (a likely focus
  given ZSAs and future shielded pool features).
- Wallet scanning performance and the move to a Rust-native wallet.
- A migration path for the Sprout pool.
- Test infrastructure: bringing fuzzing, differential testing, and
  property-based testing into routine CI.
- Reproducible builds: replacing or modernising the Gitian pipeline.

Pick one and dig.

## Suggested daily/weekly rhythm

- Mornings: read code with a notebook open, write down questions.
- Afternoons: run the node, instrument it, write small patches that
  answer the morning's questions.
- One day per week: read upstream librustzcash and orchard crates,
  follow recent merged PRs there.
- Fridays: write a short summary (one page) of what you learned.
- Mondays: review the previous Friday's summary and pick the week's
  goals.

Six weeks of this is enough to be productive. Twelve weeks is enough to
be confident in any single area. Eighteen months is enough to be the
person other people ask.
