---
sidebar_position: 2
title: "Build system and contribution loop"
description: "autotools, depends/, zcutil/build.sh, Rust/C++ interop via cxx, and the local commands you run before opening a PR."
---

# Build system and contribution loop

## 1. Why this chapter exists

Until the node builds and the test suite is green, no other chapter
can be exercised on the reader's machine. This chapter covers the
three-layer build system and the local commands that every PR has to
pass before reaching CI. Misunderstanding the build is the
single most common reason new contributors get blocked for days.

## 2. Definitions

**Definition 2.1 (depends).** A Bitcoin-Core-style cross-compilation
build system that constructs a complete sysroot of vendored C/C++
dependencies for one host triplet. Each dependency is one `.mk` file
under `depends/packages/`. Output goes to `depends/<triplet>/`.

**Definition 2.2 (autotools layer).** `configure.ac` + `Makefile.am` +
`src/Makefile.am` together build the C++ tree. Driven by
`./autogen.sh` then `./configure`.

**Definition 2.3 (Cargo layer).** A single Cargo crate at the repo
root that produces `librustzcash.a` (a static library linked into
`zcashd`), plus the binaries `zcash-inspect` and
`zcashd-wallet-tool`. The crate is invoked from `src/Makefile.am`.

**Definition 2.4 (cxx bridge).** A Rust crate
([dtolnay/cxx](https://github.com/dtolnay/cxx)) that generates type-safe
FFI glue between Rust and C++. Used by all new code; declarations live in
`src/rust/src/bridge.rs`.

## 3. The code

### Quick start (Linux/macOS)

```bash
./zcutil/fetch-params.sh                  # download Sapling MPC params
./zcutil/build.sh -j$(nproc)              # full build, may take 1-2 hours
src/zcashd -datadir=/path/to/datadir      # run the node
src/zcash-cli -datadir=/path/to/datadir getinfo
```

The first build is slow because `depends/` builds Boost, BDB,
libevent, libsodium, libcxx, OpenSSL components, and a pinned Rust
toolchain. Subsequent builds reuse `depends/` outputs.

### Layer 1: depends/

`depends/` is borrowed from Bitcoin Core. Each package is a
single Makefile fragment:

```makefile reference title="depends/packages/native_cxxbridge.mk (the cxx CLI used for Rust/C++ FFI)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/depends/packages/native_cxxbridge.mk#L1-L50
```

The full set of pinned dependencies:

```
depends/packages/boost.mk
depends/packages/bdb.mk              # BerkeleyDB 6.2 for the wallet
depends/packages/libevent.mk         # HTTP server, event loop
depends/packages/libsodium.mk        # crypto primitives outside Rust
depends/packages/zeromq.mk           # ZMQ notifications
depends/packages/googletest.mk       # gtest
depends/packages/native_rust.mk      # pinned Rust toolchain
depends/packages/native_cxxbridge.mk # the cxx CLI
depends/packages/rustcxx.mk          # the Rust side of the same cxx version
depends/packages/native_clang.mk     # vendored clang (for cross builds)
depends/packages/tl_expected.mk      # tl::expected
depends/packages/utfcpp.mk           # UTF-8 helpers
```

To build dependencies for the current host:

```bash
cd depends && make -j$(nproc)
```

For another platform:

```bash
make HOST=x86_64-w64-mingw32 -j$(nproc)
```

Pinning matters. `depends/packages/native_cxxbridge.mk` and
`rustcxx.mk` must specify the same `cxx` version that `Cargo.toml`
depends on; otherwise the generated C++ header from cxxbridge will not
match the Rust runtime. There is a comment in `Cargo.toml` reminding
contributors of this:

```toml reference title="Cargo.toml (cxx version pinning note)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/Cargo.toml#L1-L60
```

### Layer 2: autotools

```
configure.ac           ~45k lines; configure-time feature detection
Makefile.am            top-level targets
src/Makefile.am        C++ source list, compile flags, links
src/Makefile.test.include    Boost.Test target
src/Makefile.bench.include   benchmarks
src/Makefile.gtest.include   gtest target
```

Flow:

```bash
./autogen.sh           # regenerate configure from configure.ac
./configure --enable-tests --with-incompatible-bdb=...
make
make check
```

`zcutil/build.sh` orchestrates this; it sets the right flags and
points at `depends/<host-triplet>/`. Important quirks:

- Bundled BDB 6.2 (legacy); `--with-incompatible-bdb` tells configure
  not to complain.
- `--enable-mining` toggles the in-process Equihash miner.
- `--enable-wallet` is on by default.
- `--with-libs=no` skips `libzcashconsensus`/`libzcash_script` (the
  consensus-only shared library exported for other projects).

### Layer 3: Cargo

Single crate, defined at the repo root:

```toml
[lib]
name = "rustzcash"
path = "src/rust/src/rustzcash.rs"
crate-type = ["staticlib"]

[[bin]]
name = "zcash-inspect"
path = "src/rust/bin/inspect/main.rs"

[[bin]]
name = "zcashd-wallet-tool"
path = "src/rust/bin/wallet_tool.rs"
```

Cargo dependencies of note (the consensus-critical ones):

```
zcash_primitives    types and consensus rules outside of zcashd
zcash_proofs        Sapling proving/verifying, parameter loading
orchard             the Orchard protocol implementation
bellman             Groth16 prover/verifier
bls12_381, jubjub   curves used by Sapling
incrementalmerkletree   note commitment trees
zcash_history       MMR history tree (ZIP-221)
zcash_note_encryption  in-band note encryption
secp256k1           transparent signatures (separate from the C version)
equihash            PoW
ed25519-zebra       Ed25519 (for binding sig and tx auth)
cxx                 the FFI bridge
```

`Cargo.lock` is committed. Any change in `cxx`, `zcash_primitives`,
`zcash_proofs`, `orchard`, or `bellman` is a consensus-relevant
change. See
[qa/supply-chain/](https://github.com/zcash/zcash/tree/v5.5.0-rc1/qa/supply-chain)
for the `cargo vet` config.

### Rust/C++ interop: cxx and FFI

Two flavours of FFI live in this repo.

**Hand-written extern "C" FFI.** The older Rust code lives in
`src/rust/src/rustzcash.rs` and exports `extern "C"` functions consumed
by C++ via headers in `src/rust/include/rust/`. Naming convention:
`librustzcash_*`. The original FFI surface; new code generally does
not add to it.

**cxx-bridge FFI.** Newer Rust code uses `cxx`. The bridge module is:

```rust reference title="src/rust/src/bridge.rs (cxx-bridge declarations)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/bridge.rs#L1-L120
```

cxx generates header files and gluing code at build time so that
`Box<T>`, `&T`, `Vec<T>` etc. can cross the boundary safely. Most of
the Sapling batch validator, Orchard bundle handling, note-encryption
batch scanner, and the new wallet scanner go through cxx.

### Rust toolchain pinning

`rust-toolchain.toml` pins the Rust version (and the components
needed). When the contributor runs `cargo build` inside this repo,
rustup will install exactly that toolchain.
`depends/packages/native_rust.mk` pins the same version for the
in-tree depends build. Both must agree; if one is bumped, the other
must follow.

### Reproducible builds and Gitian

`contrib/gitian-descriptors/` contains Gitian build descriptors.
Gitian is a deterministic-build system used to produce binary releases
that are bit-for-bit reproducible from the same source. The release
process (`doc/release-process.md`) runs Gitian and publishes the
resulting binaries together with detached signatures. ZODL will need
to either continue running Gitian or move to a replacement (Nix,
Bazel, or a modernised reproducible-build pipeline). This is one of
the larger pieces of operational work for the new maintainers.

## The local contribution loop

The single chapter most-visited by working contributors. Every PR
must pass these commands locally before it reaches CI.

```bash
# Bring up the build
./zcutil/fetch-params.sh
./zcutil/build.sh -j$(nproc)

# Run focused tests during development
src/zcash-gtest --gtest_filter='ChecktransactionTest.*'
src/test/test_bitcoin --run_test=mempool_tests
cargo test --manifest-path Cargo.toml -- sapling::batch

# Full local suite (slow; equivalent to CI)
qa/zcash/full_test_suite.py

# Style / lints
qa/zcash/full_test_suite.py noverify
contrib/devtools/check-source.sh
```

`qa/zcash/full_test_suite.py` is the closest thing to "what CI runs".
It iterates: Boost.Test, GoogleTest, Rust unit tests, and the RPC
test suite.

The repo's `CONTRIBUTING.md` is a one-line pointer to the
[ECC Development Guidelines](https://zcash.readthedocs.io/en/latest/rtd_pages/development_guidelines.html);
the practical operating rules (commit style, PR style, release
process) live there.

### Adding a Rust dependency

1. Search the [librustzcash CI policy](https://github.com/zcash/librustzcash)
   for whether the dependency is already vetted there.
2. Add the dependency in `Cargo.toml`.
3. Re-run `cargo vet` and ensure
   [qa/supply-chain/](https://github.com/zcash/zcash/tree/v5.5.0-rc1/qa/supply-chain)
   is updated.
4. Re-run the full test suite.

### Adding a C++ dependency

Strongly discouraged. If unavoidable, add a `depends/packages/*.mk`
file pinning to a specific version and a tarball SHA-256, then teach
`configure.ac` how to find it.

## 4. Failure modes

- **Missing Sapling parameters.** `zcashd` refuses to start without
  them. Run `./zcutil/fetch-params.sh`. No automated test in this
  workspace; caught at first launch.
- **Stale `depends/` outputs.** After pulling, run
  `cd depends && make clean` if any package version bumped. Caught by
  build failure with mismatching headers.
- **BDB version mismatch.** Older systems ship BDB 5.x, which the
  wallet won't link against. The depends build of BDB 6.2 is the
  supported path. Caught by `configure` failure.
- **Out-of-tree builds breaking the test harness.** The test harness
  assumes the in-tree layout for `src/zcashd` and `qa/rpc-tests/`. Run
  from the source directory. Caught by RPC tests failing to locate
  the binary.
- **Mismatched cxx versions.** `Cargo.toml` and
  `depends/packages/native_cxxbridge.mk` must specify the same
  version. Caught by linker errors with garbage symbols.

## 5. Spec pointers

The build system is implementation-specific and not covered by the
protocol spec. Relevant external docs:

- [doc/release-process.md](https://github.com/zcash/zcash/blob/v5.5.0-rc1/doc/release-process.md)
  for the Gitian flow and the canonical release checklist.
- [doc/authors.md](https://github.com/zcash/zcash/blob/v5.5.0-rc1/doc/authors.md)
  for the current contributor list.
- [doc/developer-notes.md](https://github.com/zcash/zcash/blob/v5.5.0-rc1/doc/developer-notes.md)
  for the inherited Bitcoin Core code style.
- [INSTALL](https://github.com/zcash/zcash/blob/v5.5.0-rc1/INSTALL) at
  the repo root, and the upstream
  [zcash-readthedocs build guide](https://zcash.readthedocs.io/en/latest/rtd_pages/zcashd.html#building)
  for per-OS install notes (the per-OS `doc/build-*.md` files that
  Bitcoin Core ships do not exist in this tree).

## 6. Exercises

1. **Locate the pinned Rust version.** Open
   [rust-toolchain.toml](https://github.com/zcash/zcash/blob/v5.5.0-rc1/rust-toolchain.toml)
   and
   [depends/packages/native_rust.mk](https://github.com/zcash/zcash/blob/v5.5.0-rc1/depends/packages/native_rust.mk).
   Confirm they agree.

2. **Compile-time switch.** Build with `--without-mining` and confirm
   `src/pow/tromp/` is not compiled and that `getblocktemplate` still
   functions for external miners.

3. **Modify the bridge.** Add a no-op cxx-bridge function (one that
   returns a constant string from Rust to C++). Wire it into
   `src/init.cpp` so the daemon logs that string at startup. Steps:
   - Add the function in
     [src/rust/src/bridge.rs](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/bridge.rs).
   - Rebuild; cxxbridge will regenerate the header in
     `src/rust/include/rust/`.
   - Call it from `AppInit2`.
   - Verify the message appears in `debug.log`.

4. **Run the full suite.** Execute
   `qa/zcash/full_test_suite.py` on a fresh build. Note which sub-step
   takes longest; that is the natural target for parallelisation work.

## 7. Further reading

- Bitcoin Core's
  [depends/README.md](https://github.com/bitcoin/bitcoin/blob/master/depends/README.md)
  for the original design of the `depends/` system.
- [dtolnay/cxx README](https://github.com/dtolnay/cxx) for the
  semantics of the bridge.
- [Gitian build system docs](https://gitian.org/).
