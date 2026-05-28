---
sidebar_position: 3
title: "Code organization"
description: "A file-by-file map of src/ and src/rust/. The chapter you return to most often."
---

# Code organization

## 1. Why this chapter exists

`src/` contains roughly 90 loose `.cpp`/`.h` pairs (Bitcoin Core
inheritance) plus a handful of Zcash-specific subdirectories. Without
a map, a reader will spend hours grepping. This chapter is the map.
It is intended to be returned to, not read once.

The tree is wide rather than deep. Most navigation looks like
`rg "ProcessMessage" src/` followed by reading 50 - 200 lines of
context. Get comfortable with that workflow before reading on.

## 2. Definitions

**Definition 3.1 (Boundary).** The boundary in zcashd is the
Rust/C++ split. The C++ side owns networking, validation state
machine, wallet storage, mempool, and RPC dispatch. The Rust side
owns most of the cryptography (Sapling, Orchard, Halo 2, JoinSplit
verifier glue, batch validators, note encryption, BLAKE2b, ed25519,
history tree). Cross-language calls are expensive; batch validators
amortise the cost.

**Definition 3.2 (Subsystem).** A coherent group of files with a
single owning concern. The subsystems in zcashd are: entry points,
chain/blocks/transactions, transactions/scripts/addresses, P2P, RPC,
storage/serialisation, utility, consensus, Zcash-specific C++,
crypto, wallet, Rust portion, policy, pow, zmq, fuzzing, bench, test.
This chapter lists them all.

## 3. The code

### Top-level layout

```
Cargo.toml             root Cargo manifest (single crate, librustzcash)
Cargo.lock             pinned Rust deps
configure.ac           autotools (~45k lines)
Makefile.am            top-level make rules
autogen.sh             regenerates configure
rust-toolchain.toml    pinned Rust toolchain version

depends/               vendored C/C++ deps build system (see chapter 02)
zcutil/                build helpers, parameter fetcher
contrib/               packaging, gitian, completions, docker, metrics
doc/                   release notes, contributor docs, ZMQ docs
qa/                    integration tests (RPC tests + supply-chain config)
share/                 sample config, examples
src/                   all C++ and Rust source (rest of this chapter)
test/                  empty/placeholder; real tests live elsewhere
```

### Entry points

| File | Role |
|------|------|
| `bitcoind.cpp` | The `zcashd` daemon entry point. Wires `AppInit` to `AppInit2`. |
| `bitcoin-cli.cpp` | The `zcash-cli` JSON-RPC client. |
| `bitcoin-tx.cpp` | The `zcash-tx` standalone transaction builder. |
| `init.cpp` / `init.h` | `AppInit2`: 2000 lines of "bring the node up". Most important file to read once the node is built. |
| `noui.cpp` | Trivial UI implementation so that the daemon runs headless. |

`AppInit2` is worth quoting; it is the spine of node startup:

```cpp reference title="src/init.cpp (AppInit2 prologue)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/init.cpp#L900-L1000
```

### Chain, blocks, transactions

| File | Role |
|------|------|
| `main.cpp` / `main.h` | 8000+ lines. The consensus state machine: block validation, mempool acceptance, fork resolution. `ProcessNewBlock`, `ConnectBlock`, `AcceptBlock`, `ContextualCheckBlock`, `ProcessMessage`. Read in pieces. |
| `chain.cpp` / `chain.h` | `CBlockIndex` (in-memory header chain), `CChain` (active chain). |
| `chainparams.cpp` / `chainparams.h` | Mainnet/testnet/regtest parameter selection. Activation heights, seeds, magic bytes. |
| `chainparamsbase.cpp` | Network-name-keyed base parameters. |
| `chainparamsseeds.h` | Hardcoded DNS seeds. |
| `coins.cpp` / `coins.h` | `CCoinsView`, `CCoinsViewCache`: the UTXO set abstraction. |
| `txdb.cpp` | LevelDB persistence of UTXO and block index. |
| `txmempool.cpp` / `txmempool.h` | The mempool. |
| `mempool_limit.cpp` | Bound mempool by weighted cost (anti-DoS). |
| `validationinterface.cpp` | Pub/sub for "block connected" etc. The wallet subscribes here. |
| `merkleblock.cpp` | Partial Merkle trees for SPV. |
| `pow.cpp` / `pow.h` | Difficulty adjustment, Equihash check, mining target glue. |
| `proof_verifier.cpp` | Owns the Sapling and Sprout proof verifiers. |

### Transactions, scripts, addresses

| File | Role |
|------|------|
| `primitives/transaction.{h,cpp}` | `CTransaction`, the on-wire bundles. Read with the spec in hand. |
| `primitives/block.{h,cpp}` | `CBlock`, `CBlockHeader`. Equihash solution lives here. |
| `primitives/orchard.h` | C++ shim wrapping the Orchard bundle owned by Rust. |
| `script/script.{h,cpp}` | Bitcoin Script opcodes and `CScript`. |
| `script/interpreter.{h,cpp}` | Script evaluation. |
| `script/sign.{h,cpp}` | Building signatures for transparent inputs. |
| `script/standard.{h,cpp}` | P2PKH/P2SH/multisig templates and address extraction. |
| `script/zcash_script.{h,cpp}` | Exported `libzcash_script` C API. |
| `script/sigcache.cpp` | Cache of validated ECDSA signatures. |
| `script/ismine.{h,cpp}` | Wallet-side "do I own this script?". |
| `key.cpp` / `pubkey.cpp` | secp256k1 key pair (private/public). |
| `keystore.cpp` | In-memory keystore (legacy). |
| `key_io.cpp` | Base58/Bech32 address encoding, WIF encoding. |
| `base58.cpp`, `bech32.cpp` | The two address encoding formats. |

### P2P

| File | Role |
|------|------|
| `net.{h,cpp}` | The socket and peer plumbing. `CNode`, `ThreadSocketHandler`, `ThreadMessageHandler`. |
| `netbase.cpp` | `CNetAddr`, `CService`. |
| `addrman.{h,cpp}` | Peer address manager. |
| `addrdb.cpp` | Persists addrman to `peers.dat`. |
| `bloom.cpp` | Bloom filters for SPV. |
| `protocol.{h,cpp}` | Wire protocol constants. |
| `httpserver.cpp`, `httprpc.cpp` | HTTP layer for JSON-RPC and REST. |
| `rest.cpp` | REST endpoint. |
| `torcontrol.cpp` | Optional Tor hidden-service support. |
| `sendalert.cpp` | Legacy alert system. |

### RPC

| File | Role |
|------|------|
| `rpc/server.{h,cpp}` | Dispatch table, auth, worker loop. |
| `rpc/client.{h,cpp}` | Client-side (used by `zcash-cli`). |
| `rpc/protocol.{h,cpp}` | JSON-RPC error codes. |
| `rpc/blockchain.cpp` | `getblockchaininfo`, `getblock`, etc. |
| `rpc/mining.cpp` | `getblocktemplate`, `submitblock`. |
| `rpc/net.cpp` | `getpeerinfo`, `addnode`. |
| `rpc/rawtransaction.cpp` | `decoderawtransaction`, `sendrawtransaction`. |
| `rpc/misc.cpp` | Everything else (e.g. `validateaddress`). |
| `rpc/register.h` | Registration of command tables. |

Wallet RPCs are in `wallet/rpcwallet.cpp`, `wallet/rpcdump.cpp`,
`wallet/rpcdisclosure.cpp`.

### Storage and serialisation

| File | Role |
|------|------|
| `dbwrapper.{h,cpp}` | LevelDB C++ wrapper. |
| `leveldb/` | Vendored LevelDB. |
| `crc32c/` | Vendored CRC32C used by LevelDB. |
| `streams.h`, `streams_rust.cpp` | Serialisation streams and Rust bridges. |
| `serialize.h` | The Bitcoin-style `READWRITE` macros. Every consensus structure is serialised through these. |

### Utility, support

| File | Role |
|------|------|
| `util/system.{cpp,h}` | Arg parsing, `gArgs`, daemonisation. |
| `util/strencodings.{cpp,h}` | Hex, base32/64. |
| `util/moneystr.{cpp,h}` | Money formatting. |
| `util/time.{cpp,h}` | Monotonic time, mock time for tests. |
| `util/match.h` | `std::visit` helpers. |
| `support/` | Allocator, lockedpool, cleanse. |
| `compat/` | byteswap, endian, sanity. |
| `crypto/` | Hash functions; see chapter 06. |
| `secp256k1/` | Vendored libsecp256k1. |
| `univalue/` | Vendored UniValue (JSON for RPC). |
| `random.{cpp,h}` | `GetRandBytes`, `FastRandomContext`. |
| `sync.{cpp,h}` | Mutex types, `LOCK` macros. |
| `scheduler.{cpp,h}` | Small task scheduler. |
| `tinyformat.h` | The `tfm::format` printf-alike. |
| `uint256.{cpp,h}`, `uint252.h`, `arith_uint256.{cpp,h}` | 256-bit hash type and friends. |
| `prevector.h` | Small-buffer-optimised vector. |
| `cuckoocache.h` | Approximate set used by sigcache. |
| `logging.{cpp,h}` | C++ logger. |
| `metrics.{cpp,h}` | Prometheus metrics; exporter is in Rust. |
| `clientversion.{cpp,h}` | Version strings on the wire and in RPC. |

### Zcash-specific subdirectories

#### `src/consensus/`

The consensus parameters and the network upgrade tables. Small, central.

```
params.h               Consensus::Params, NetworkUpgrade, FundingStream
params.cpp             helpers on Params
upgrades.h, upgrades.cpp   NetworkUpgradeInfo[], CurrentEpochBranchId
funding.h, funding.cpp     FundingStreamInfo[]; ZIP-207/214
merkle.h, merkle.cpp       block transaction Merkle root, witness root
validation.h               CValidationState
consensus.h                MAX_BLOCK_SIZE, dust thresholds
```

The whole consensus parameter set:

```cpp reference title="src/consensus/params.h (Consensus::Params)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/consensus/params.h#L1-L100
```

Read these before reading `main.cpp`. They are the vocabulary
`main.cpp` is written in.

#### `src/zcash/`

C++ types and logic that are Zcash-specific but live on the C++ side
rather than the Rust side (mostly historical: things written before
librustzcash existed).

```
Address.{hpp,cpp}            address types, ReceiverIterator
Note.{hpp,cpp}               Sprout/Sapling note types (C++ side)
NoteEncryption.{hpp,cpp}     Sprout note encryption
JoinSplit.{hpp,cpp}          Sprout JoinSplit logic
Proof.hpp                    BN254 group elements, Sprout proof wrappers
IncrementalMerkleTree.{hpp,cpp}  the C++ Merkle tree (still used by Sprout)
History.{hpp,cpp}            ZIP-221 history MMR shims to Rust
cache.{h,cpp}                proof and signature caches
prf.{h,cpp}                  Sprout PRFs
util.{h,cpp}                 misc helpers
Zcash.h                      tiny umbrella header (network defaults)

address/
    sprout, sapling, orchard, transparent, unified  - one file per receiver kind
    mnemonic                                          - BIP-39 mnemonic
    zip32                                             - ZIP-32 HD keys
```

The naming is inconsistent (`.hpp` vs `.h`). Historical; not worth
fixing now.

#### `src/crypto/`

Symmetric primitives and hashes used directly by C++. Anything that
the Rust side already provides is preferred to live in Rust.

```
sha256.{h,cpp}, sha256_avx2.cpp, sha256_sse4.cpp, sha256_sse41.cpp, sha256_shani.cpp
sha512.{h,cpp}, sha1.{h,cpp}, ripemd160.{h,cpp}
hmac_sha256.{h,cpp}, hmac_sha512.{h,cpp}
chacha20.{h,cpp}
aes.{h,cpp}              wrapper around ctaes/
ctaes/                   constant-time AES
equihash.{h,cpp,tcc}     PoW; uses BLAKE2b from rust/blake2b.h
```

BLAKE2b lives on the Rust side (`src/rust/src/blake2b.rs`) and is
consumed by C++ via cxx (see `src/rust/include/rust/blake2b.h`).

#### `src/wallet/`

The legacy wallet. Single-user, BDB-backed.

```
wallet.{h,cpp}                 the CWallet class
walletdb.{h,cpp}               BDB-backed persistent storage
db.{h,cpp}                     BDB wrapper
crypter.{h,cpp}                wallet encryption (AES with passphrase-derived key)
orchard.{h,cpp}                Orchard-specific wallet integration
memo.h                         Zcash memo field
paymentdisclosure*             ZIP-308 payment disclosure
rpcwallet.cpp, rpcdump.cpp, rpcdisclosure.cpp   wallet RPC commands
asyncrpcoperation_*.cpp        long-running operations
wallet_tx_builder.cpp          new transaction builder
test/, gtest/                  wallet-specific test suites
```

Most real-world bug reports land in the wallet.

#### `src/rust/`

The Rust portion.

```
src/rust/Cargo*                 (driven from the top-level Cargo.toml)
src/rust/include/rust/          hand-written C headers for the extern "C" FFI
src/rust/src/rustzcash.rs       main FFI module (extern "C" exports)
src/rust/src/bridge.rs          cxx-bridge declarations
src/rust/src/*_ffi.rs           per-subsystem FFI shims
src/rust/src/blake2b.rs         BLAKE2b helpers exposed to C++
src/rust/src/sapling.rs         Sapling bundle assembly, batch validation
src/rust/src/orchard_*.rs       Orchard bundle, FFI, batch validation
src/rust/src/zcashd_orchard.rs  Orchard wallet glue
src/rust/src/note_encryption.rs Sapling note decryption (batched)
src/rust/src/wallet_scanner.rs  trial-decryption pipeline
src/rust/src/merkle_frontier.rs Orchard incremental tree state
src/rust/src/bundlecache.rs     bundle-level validation cache
src/rust/src/streams*.rs        binding C++ serialisation streams into Rust
src/rust/src/tracing_ffi.rs     bridge from tracing(Rust) to logging(C++)
src/rust/src/metrics_ffi.rs     metrics(Rust) to Prometheus exporter

src/rust/bin/inspect/main.rs    the zcash-inspect debug CLI
src/rust/bin/wallet_tool.rs     the zcashd-wallet-tool migration helper
src/rust/tests/                 Rust-side tests (integration with C++ stubs)
```

#### `src/policy/`

Mempool acceptance policies above and beyond consensus. Fee policy,
standard-transaction predicates.

#### `src/pow/`

```
pow/tromp/             vendored equihash solver (John Tromp's)
```

Only built with `--enable-mining`. The verifier lives in
`src/crypto/equihash.cpp`.

#### `src/zmq/`

ZMQ publisher for block/tx notifications. Off by default. Documented
in `doc/zmq.md`.

#### `src/fuzzing/`

Fuzz targets. Built via the AFL/libFuzzer harnesses in `zcutil/afl/`
and `zcutil/libfuzzer/`.

#### `src/bench/`

Microbenchmarks (`bench_bitcoin`).

#### `src/gtest/` and `src/test/`

Two parallel C++ unit-test suites; see [chapter 09](./09-testing.md).

## Hot files

Most-changed files under `src/` on master in the last 2 years (more
recent activity ranks higher). Use as a guide to where contributions
actually land:

| Count | File | What contributors usually change |
|-------|------|-----------------------------------|
| 64 | `src/main.cpp` | New per-NU validation rules, bug fixes in the validation pipeline |
| 26 | `src/deprecation.h` | Release-height bump per version |
| 18 | `src/chainparams.cpp` | Activation heights for new NUs, funding-stream updates |
| 16 | `src/consensus/params.h` | New consensus parameters per NU |
| 15 | `src/clientversion.h` | Per-release version string |
| 13 | `src/consensus/params.cpp` | Helpers on `Consensus::Params` |
| 10 | `src/rpc/mining.cpp` | `getblocktemplate` evolution |
| 10 | `src/miner.cpp` | Block template construction tweaks |
| 10 | `src/gtest/test_validation.cpp` | New tests pinned to new rules |

If a candidate PR does not touch one of these files and is not in
`src/rust/`, the contributor should pause and check that the change
is in the right place. Most fixes converge here.

## 4. Failure modes

- **Editing `main.cpp` without reading the relevant `Check*`
  function.** The validation pipeline is brittle; insertions in the
  middle break ordering assumptions. Caught by `src/gtest/test_*.cpp`
  if a test exists for the rule.
- **Adding files to `src/zcash/` that should be in `src/rust/`.** New
  cryptography belongs on the Rust side. Caught only by code review.
- **Mixing `.h` and `.hpp` for the same module.** The codebase is
  inconsistent; pick the convention of the surrounding file.
- **Bypassing `serialize.h`.** Any consensus-relevant byte format
  must go through `READWRITE` so that the hash code, network code, and
  disk code all agree.

## 5. Spec pointers

- [Spec section 7 (Consensus changes)](https://zips.z.cash/protocol/protocol.pdf):
  the section list mirrors what `src/consensus/` enforces.
- [Bitcoin Core developer docs](https://github.com/bitcoin/bitcoin/tree/master/doc):
  for any file that does not look Zcash-specific.

## 6. Exercises

1. **Subsystem ownership.** Pick one source file at random and
   determine which subsystem it belongs to using the tables in
   section 3. If it is none of them, that is a finding worth raising.

2. **Cross-language search.** Grep for one `librustzcash_*` function
   that appears in both
   [src/rust/include/rust/](https://github.com/zcash/zcash/tree/v5.5.0-rc1/src/rust/include/rust)
   and a `.cpp` file. Identify both ends and the FFI signature.

3. **Build an LSP setup.** Generate a `compile_commands.json` (with
   `bear -- ./zcutil/build.sh`) and confirm clangd can jump from a
   `ContextualCheckTransaction` call site in `main.cpp` to the
   definition.

4. **Modification exercise.** Add a TRACE-level log line in
   `validationinterface.cpp` that fires every time `BlockChecked` is
   invoked. Confirm it appears under `-debug=mempool` against
   regtest.

## 7. Further reading

- The Bitcoin Core
  [doc/developer-notes.md](https://github.com/bitcoin/bitcoin/blob/master/doc/developer-notes.md)
  for the inherited code style.
- The first 200 lines of
  [src/init.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/init.cpp).
  A startup walk-through.
