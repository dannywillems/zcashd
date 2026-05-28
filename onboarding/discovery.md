# Discovery notes

Notes captured during the bootstrap of the Docusaurus onboarding course.
Anchors the chapter graph to ground truth.

## Pin

- Upstream repository: `https://github.com/zcash/zcash`
- Pinned release tag: `v5.5.0-rc1` (the most recent ECC release at the
  time of bootstrap; used in every `<lang> reference` embed).
- Course source repository (fork): `https://github.com/dannywillems/zcashd`
- Course branch: `onboarding`

The pin determines URL stability of every live-source embed. If the
upstream tag pattern changes (e.g. v5.6.0 ships), bump `ZCASH_PIN` in
`docusaurus.config.ts` and update the embed URLs across `docs/`. Do not
move to `main`; renames break links silently.

## Workspace shape (top level)

```
Cargo.toml             root manifest (single crate, librustzcash, plus 2 bins)
Cargo.lock             pinned Rust deps (committed)
configure.ac           GNU autotools (~45k lines)
Makefile.am            top-level autotools
rust-toolchain.toml    pinned Rust toolchain
.cargo/config.toml     Cargo config
autogen.sh             regenerates configure
depends/               vendored C/C++ deps build system (Bitcoin Core style)
zcutil/                build helpers, parameter fetcher, fuzzer drivers
contrib/               packaging, gitian, completions, docker, metrics
doc/                   release notes, contributor docs, ZMQ docs
qa/                    integration tests (Python RPC harness) + supply-chain
share/                 sample config
src/                   all C++ and Rust source
```

## src/ shape

Roughly 90 loose `.cpp`/`.h` files (Bitcoin Core inheritance) plus the
Zcash-specific subdirectories:

```
src/consensus/   network upgrades, params, funding, merkle, validation
src/crypto/      SHA-2 family, RIPEMD, ChaCha20, AES (ctaes), Equihash
src/policy/      mempool policy
src/pow/         Tromp's Equihash solver (mining)
src/primitives/  CTransaction, CBlock, OrchardBundle shim
src/rpc/         JSON-RPC server + dispatch tables
src/rust/        Rust portion (src/, include/rust/, bin/, tests/)
src/script/      Bitcoin Script: ops, interpreter, sign, standard
src/secp256k1/   vendored libsecp256k1
src/support/     allocator, lockedpool, cleanse
src/util/        gArgs, strencodings, time, money
src/wallet/      legacy BDB wallet
src/zcash/       Zcash-specific C++ (Sprout, addresses, IMT, history)
src/zmq/         optional ZMQ publisher
src/leveldb/     vendored LevelDB
src/univalue/    vendored UniValue (JSON)
src/fuzzing/     fuzz targets
src/bench/       microbenchmarks (bench_bitcoin)
src/gtest/       Zcash-added unit tests (GoogleTest)
src/test/        Bitcoin-Core inherited unit tests (Boost.Test)
```

The Rust side (single Cargo workspace, root manifest):

```
src/rust/src/rustzcash.rs       extern "C" FFI exports (the original surface)
src/rust/src/bridge.rs          cxx-bridge declarations (new surface)
src/rust/src/*_ffi.rs           per-subsystem FFI shims
src/rust/src/sapling.rs         Sapling bundle, batch validator
src/rust/src/orchard_*.rs       Orchard bundle, FFI, batch validator
src/rust/src/note_encryption.rs Sapling note decryption (batched)
src/rust/src/wallet_scanner.rs  trial-decryption pipeline
src/rust/src/merkle_frontier.rs Orchard incremental tree state
src/rust/src/bundlecache.rs     bundle-level validation cache
src/rust/src/blake2b.rs         BLAKE2b helpers exposed to C++
src/rust/src/ed25519.rs         Sprout binding signature
src/rust/src/tracing_ffi.rs     tracing(Rust) -> logging(C++)
src/rust/src/metrics_ffi.rs     metrics(Rust) -> Prometheus exporter
src/rust/bin/inspect/           zcash-inspect debug CLI
src/rust/bin/wallet_tool.rs     zcashd-wallet-tool migration helper
```

## Build system

Three layers, in order:

1. `depends/` builds Boost, BDB 6.2, libevent, libsodium, libcxx, OpenSSL
   bits, googletest, a pinned Rust toolchain, cxxbridge, tl::expected,
   utfcpp. Per-host triplet (`x86_64-linux-gnu`, etc.). Pinned by .mk files
   under `depends/packages/`.
2. `configure.ac` + `Makefile.am` + `src/Makefile.am` build the C++ tree
   against the depends sysroot.
3. `Cargo.toml` (driven by autotools) builds `librustzcash.a`, `zcash-inspect`,
   `zcashd-wallet-tool`.

Driver: `zcutil/build.sh`. Sapling parameters: `zcutil/fetch-params.sh`.

## Hot files (most-changed under `src/` on master, last 2 years)

```
64  src/main.cpp
26  src/deprecation.h
18  src/chainparams.cpp
16  src/consensus/params.h
15  src/clientversion.h
13  src/consensus/params.cpp
10  src/rpc/mining.cpp
10  src/miner.cpp
10  src/gtest/test_validation.cpp
 8  src/wallet/rpcwallet.cpp
 7  src/init.cpp
 6  src/chainparams.h
```

The signal: `main.cpp` is by far the most-touched (validation pipeline);
`deprecation.h` ticks every release (release-height bump);
`chainparams.cpp` and `consensus/params.h` evolve with each network
upgrade; `clientversion.h` evolves per release.

## Test layout

Five layers, ordered by speed:

1. Rust unit tests (`cargo test`) - hundreds of ms.
2. C++ Boost.Test inherited (`src/test/`, built as `test_bitcoin`) - seconds.
3. C++ GoogleTest Zcash (`src/gtest/`, built as `zcash-gtest`) - seconds.
4. C++ wallet (`src/wallet/test/`, `src/wallet/gtest/`) - seconds.
5. Python RPC integration (`qa/rpc-tests/`, harness at
   `qa/pull-tester/rpc-tests.py`) - 30+ seconds bring-up per test.

Full suite: `qa/zcash/full_test_suite.py`.

## CI

Under `.github/workflows/`:

- `audits.yml`: cargo-vet and supply-chain checks.
- `book.yml`: builds the existing ECC book (separate from this course).
- `checks.yml`: build + tests.
- `lints.yml`: linting and style.

CI does not run fuzzers, benchmarks, or cross-implementation diff
tests. Plan to backfill these as periodic schedules.

## PR / contribution gate

`CONTRIBUTING.md` is a one-liner pointing at the Read the Docs
"Development Guidelines" page:

`https://zcash.readthedocs.io/en/latest/rtd_pages/development_guidelines.html`

There is no explicit issue-required-or-team-ack gate in the repo. The
disclosure policy (`SECURITY.md`) is the only formal process gate, and
it is for security reports, not regular PRs.

## Issue trackers and external references

- zcashd issues: `https://github.com/zcash/zcash/issues`
- ZIPs: `https://zips.z.cash/`, repo `https://github.com/zcash/zips`
- Protocol spec PDF: `https://zips.z.cash/protocol/protocol.pdf`
- librustzcash: `https://github.com/zcash/librustzcash`
- orchard: `https://github.com/zcash/orchard`
- halo2 book: `https://zcash.github.io/halo2/`
- orchard book: `https://zcash.github.io/orchard/`
- zebra (Foundation full node): `https://github.com/ZcashFoundation/zebra`

## Chapter graph (derived)

The chapter list is in `docs/`. Dependency order:

```
index   home, disclaimer, threat model, notation
01      context and history
02      build system and contribution loop
03      code organization (the file map)
04      consensus
05      P2P networking
06      cryptography (non-ZK)
07      zk proofs and shielded pools
08      wallet and RPC
09      testing
10      reading plan (6 weeks, with exercises)
11      glossary (flat list of domain abbreviations)
12      external references (ZIPs, papers, spec)
```

01 - 03 are load-bearing (the file map is the single most-visited
chapter). 04 - 08 are the substantive content. 09 - 12 are reference.
