# 02 - Build system

Zcash builds from source. There are no prebuilt binaries published by ECC for
most platforms, and the supply-chain assumption is that you have built the
binary yourself from the tagged source. The build system has three layers:

1. `depends/` (autotools-style) builds vendored C/C++ dependencies into a
   sysroot.
2. `configure.ac` + `Makefile.am` (GNU autotools) builds the C++ code
   against that sysroot.
3. `Cargo.toml` (Cargo, called from the autotools build) builds the Rust
   static library `librustzcash` and the auxiliary binaries
   `zcash-inspect` and `zcashd-wallet-tool`.

The driver script `zcutil/build.sh` orchestrates 1 and 2.

## Quick start (Linux/macOS)

```
./zcutil/fetch-params.sh                  # download Sapling MPC params
./zcutil/build.sh -j$(nproc)              # full build, may take 1-2 hours
src/zcashd -datadir=/path/to/datadir      # run the node
src/zcash-cli -datadir=/path/to/datadir getinfo
```

The first build is slow because `depends/` builds Boost, BDB, libevent,
libsodium, libcxx, OpenSSL components, and a pinned Rust toolchain. Later
builds reuse `depends/` outputs.

## Officially supported platforms

Debian, Ubuntu. Other platforms work in practice (macOS, NixOS, Fedora) but
are not in CI. See `doc/build-` files (if present) for per-OS notes and
`depends/hosts/` for the cross-compile triplets that are configured.

## Layer 1: depends/

`depends/` is borrowed from Bitcoin Core. It is a small autotools-driven
build system that constructs a complete sysroot for one host triplet (e.g.
`x86_64-linux-gnu`, `aarch64-apple-darwin25.4.0`). Each dependency is one
`.mk` file in `depends/packages/`:

```
depends/packages/boost.mk
depends/packages/bdb.mk              # BerkeleyDB 6.2 for the wallet
depends/packages/libevent.mk         # HTTP server, event loop
depends/packages/libsodium.mk        # crypto primitives outside Rust
depends/packages/zeromq.mk           # ZMQ notifications
depends/packages/googletest.mk       # gtest
depends/packages/native_rust.mk      # pinned Rust toolchain
depends/packages/native_cxxbridge.mk # the cxx CLI used for Rust/C++ FFI
depends/packages/rustcxx.mk          # the Rust side of the same cxx version
depends/packages/native_clang.mk     # vendored clang (for cross builds)
depends/packages/tl_expected.mk      # tl::expected (C++ expected<T,E>)
depends/packages/utfcpp.mk           # UTF-8 helpers
```

To build dependencies for the current host:

```
cd depends && make -j$(nproc)
```

For another platform:

```
make HOST=x86_64-w64-mingw32 -j$(nproc)
```

The output goes into `depends/<host-triplet>/`. The top-level `configure`
is then pointed at it via `--prefix=$(pwd)/depends/<host-triplet>`.

Pinning matters. `depends/packages/native_cxxbridge.mk` and `rustcxx.mk` must
specify the same `cxx` version that `Cargo.toml` depends on; otherwise the
generated C++ header from cxxbridge will not match the Rust runtime. There is
a comment in `Cargo.toml` reminding you of this:

```
# Rust/C++ interop
# The version needs to match depends/packages/native_cxxbridge.mk
cxx = { version = "=1.0.94", features = ["c++17"] }
```

## Layer 2: autotools

The C++ build is GNU autotools. The relevant files:

```
configure.ac           # ~45k lines; configure-time feature detection
Makefile.am            # top-level targets, distribution rules
src/Makefile.am        # C++ source list, compile flags, links
src/Makefile.test.include    # gtest target
src/Makefile.bench.include   # benchmarks
src/Makefile.crc32c.include  # vendored crc32c
src/Makefile.leveldb.include # vendored leveldb
src/Makefile.gtest.include   # gtest target (gtest variant)
```

The flow:

```
./autogen.sh           # regenerate configure from configure.ac (needs autoconf)
./configure --enable-tests --with-incompatible-bdb=...   # configure
make                   # build
make check             # run unit tests
```

In practice you let `zcutil/build.sh` do this; it sets the right flags and
points at `depends/<host-triplet>/`.

Important autotools quirks:

- The build uses bundled BDB 6.2 (legacy) for the wallet; the
  `--with-incompatible-bdb` flag tells configure not to complain.
- `--enable-mining` toggles the in-process Equihash miner. Defaults on.
- `--enable-wallet` is on by default. Compile-out is supported but rare.
- `--with-libs=no` skips building `libzcashconsensus`/`libzcash_script` (the
  consensus-only shared library exported for other projects to link).

## Layer 3: Cargo

The Rust side is a single crate, defined in the top-level `Cargo.toml`:

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

Cargo is invoked by the autotools build via `src/Makefile.am`. The result is
a static library `librustzcash.a` and two binaries. The C++ binary
`zcashd` links the static library; the two Rust binaries are standalone.

Cargo dependencies of note:

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

`Cargo.lock` is committed. Treat dependency updates with caution: any change
in `cxx`, `zcash_primitives`, `zcash_proofs`, `orchard`, or `bellman` is a
consensus-relevant change. See `qa/supply-chain/` for the `cargo vet` config.

## Rust/C++ interop: cxx and FFI

There are two flavours of FFI in this repo.

**Hand-written extern "C" FFI.** Most of the older Rust code lives in
`src/rust/src/rustzcash.rs` and exports `extern "C"` functions consumed by
C++ via headers in `src/rust/include/rust/`. The naming convention is
`librustzcash_*`. This is the original FFI surface; new code generally does
not add to it.

**cxx-bridge FFI.** Newer Rust code uses
`https://github.com/dtolnay/cxx`. The bridge module is
`src/rust/src/bridge.rs`. cxx generates header files and gluing code at
build time so that you can pass `Box<T>`, `&T`, `Vec<T>`, etc. between
C++ and Rust safely. The build dependencies `native_cxxbridge` (host) and
`rustcxx` (target) provide the matching tools.

Read `src/rust/src/bridge.rs` to see what is exposed. Most of the Sapling
batch validator, Orchard bundle handling, note encryption batch scanner,
and the new wallet scanner go through cxx.

## Rust toolchain pinning

`rust-toolchain.toml` pins the Rust version (and the components needed). When
you `cargo build` inside this repo, rustup will install exactly that
toolchain. `depends/packages/native_rust.mk` pins the same version for the
in-tree depends build. Both must agree; if you bump one, bump both.

## Reproducible builds and Gitian

`contrib/gitian-descriptors/` contains Gitian build descriptors. Gitian is a
deterministic-build system used to produce binary releases that are
bit-for-bit reproducible from the same source. The release process (see
`doc/release-process.md`) runs Gitian and publishes the resulting binaries
together with detached signatures.

ZODL will need to either continue running Gitian for releases, or move to a
replacement (Nix, Bazel, or a modernised reproducible-build pipeline). This
is one of the larger pieces of operational work for the new maintainers.

## Common build pitfalls

- Missing Sapling parameters. `zcashd` refuses to start without them. Run
  `./zcutil/fetch-params.sh`.
- Stale `depends/`. After pulling, run `cd depends && make clean` if any
  package version bumped.
- BDB version mismatch. Older systems ship BDB 5.x, which the wallet won't
  link against. The depends build of BDB 6.2 is the supported path.
- Out-of-tree builds are supported but the test harness assumes the
  in-tree layout for `src/zcashd` and `qa/rpc-tests/`. Run from the source
  directory.

## Makefile targets you will use

```
./zcutil/build.sh -j$(nproc)        # full build
./zcutil/clean.sh                   # clean intermediate artifacts
./zcutil/distclean.sh               # also clean depends/
make -C src check                   # gtest unit tests
make -C src bench_bitcoin           # build benchmark binary
qa/zcash/full_test_suite.py         # everything (units + RPC tests + Rust tests)
qa/pull-tester/rpc-tests.py         # run RPC tests only
cargo test --manifest-path Cargo.toml   # Rust crate tests (requires depends/)
```
