# 03 - Code organization

This is a map of the source tree. For each subdirectory and the loose files
in `src/`, you get: what it does, the files to read first, and where it
plugs into the rest of the system.

The tree is wide rather than deep. Most of `src/` is a flat directory of
roughly 90 `.cpp`/`.h` pairs inherited from Bitcoin Core. The Zcash-specific
code clusters into a handful of named subdirectories (`zcash/`, `rust/`,
`crypto/`, `consensus/`).

## Top-level layout

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

## src/ flat files

These are the loose files in `src/`. The list is grouped by role rather than
alphabetically.

### Entry points

| File | Role |
|------|------|
| `bitcoind.cpp` | The `zcashd` daemon entry point. Wires `AppInit` -> `AppInit2`. |
| `bitcoin-cli.cpp` | The `zcash-cli` JSON-RPC client. |
| `bitcoin-tx.cpp` | The `zcash-tx` standalone transaction builder. |
| `init.cpp` / `init.h` | `AppInit2`: 2000 lines of "bring the node up": parse args, load chain, start RPC server, start P2P, start scheduler. The single most important file to read once you have built the node. |
| `noui.cpp` | A trivial UI implementation so that the daemon can run headless. |

### Chain, blocks, transactions

| File | Role |
|------|------|
| `main.cpp` / `main.h` | 8000+ lines. The consensus state machine: block validation, mempool acceptance, fork resolution. `ProcessNewBlock`, `ConnectBlock`, `AcceptBlock`, `ContextualCheckBlock`, `ProcessMessage`. Read this in pieces, not in one sitting. |
| `chain.cpp` / `chain.h` | `CBlockIndex` (in-memory header chain), `CChain` (active chain). |
| `chainparams.cpp` / `chainparams.h` | Mainnet/testnet/regtest parameter selection. Activation heights for each NU, seeds, magic bytes. Read alongside `consensus/params.h`. |
| `chainparamsbase.cpp` | Network-name-keyed base parameters. |
| `chainparamsseeds.h` | Hardcoded DNS seeds. |
| `coins.cpp` / `coins.h` | `CCoinsView`, `CCoinsViewCache`: the UTXO set abstraction. The transparent half of validation reads/writes here. |
| `txdb.cpp` | LevelDB persistence of UTXO and block index. |
| `txmempool.cpp` / `txmempool.h` | The mempool: unconfirmed transactions, fee/priority sort. |
| `mempool_limit.cpp` | Bound mempool by weighted cost (anti-DoS). |
| `validationinterface.cpp` | Pub/sub for "block connected", "tx removed from mempool", etc. The wallet subscribes here. |
| `validation.h` (in `consensus/`) | `CValidationState` for accumulating validation errors. |
| `merkleblock.cpp` | Partial Merkle trees for SPV. |
| `pow.cpp` / `pow.h` | Difficulty adjustment, Equihash check, mining target glue. |
| `proof_verifier.cpp` | Owns the Sapling and Sprout proof verifiers; the C++ wrapper around the Rust verifier handles. |

### Transactions, scripts, addresses

| File | Role |
|------|------|
| `primitives/transaction.{h,cpp}` | `CTransaction`, `CTxIn`, `CTxOut`, the Sprout/Sapling/Orchard bundle fields. Read with the spec in hand; the field layout is consensus. |
| `primitives/block.{h,cpp}` | `CBlock`, `CBlockHeader`. Equihash solution lives here. |
| `primitives/orchard.h` | C++ shim wrapping the Orchard bundle owned by Rust. |
| `script/script.{h,cpp}` | Bitcoin Script opcodes and the `CScript` type. |
| `script/interpreter.{h,cpp}` | Script evaluation. |
| `script/sign.{h,cpp}` | Building signatures for transparent inputs. |
| `script/standard.{h,cpp}` | P2PKH/P2SH/multisig templates and address extraction. |
| `script/zcash_script.{h,cpp}` | The exported `libzcash_script` C API used by third parties to verify scripts without running a node. |
| `script/sigcache.cpp` | Cache of validated ECDSA signatures. |
| `script/ismine.{h,cpp}` | Wallet-side "do I own this script?". |
| `key.cpp` / `pubkey.cpp` | secp256k1 key pair (private/public). Wrappers around `src/secp256k1/`. |
| `keystore.cpp` | In-memory keystore (legacy). |
| `key_io.cpp` | Base58/Bech32 address encoding, key encoding (WIF). |
| `base58.cpp`, `bech32.cpp` | The two address encoding formats. |

### P2P

| File | Role |
|------|------|
| `net.{h,cpp}` | The socket and peer plumbing. `CNode`, `CConnman`-ish (older style), `ThreadSocketHandler`, `ThreadMessageHandler`. |
| `netbase.cpp` | `CNetAddr`, `CService`: address parsing, family handling. |
| `addrman.cpp` | Peer address manager: known peers, tried table, new table. |
| `addrdb.cpp` | Persists addrman to `peers.dat`. |
| `bloom.cpp` | Bloom filters for SPV requests. |
| `protocol.{h,cpp}` | Wire protocol constants: command names ("version", "block", "tx"...), service flags, magic bytes. |
| `httpserver.cpp`, `httprpc.cpp` | The HTTP layer for JSON-RPC and REST. |
| `rest.cpp` | The REST endpoint (`/rest/...`). |
| `torcontrol.cpp` | Optional Tor hidden-service support. |
| `sendalert.cpp` | The legacy alert system (kept for parsing only; outgoing alerts deprecated). |

### RPC

| File | Role |
|------|------|
| `rpc/server.{h,cpp}` | Dispatch table, auth, the worker loop. |
| `rpc/client.{h,cpp}` | Client-side (used by `zcash-cli`). |
| `rpc/protocol.{h,cpp}` | JSON-RPC error codes and helpers. |
| `rpc/blockchain.cpp` | `getblockchaininfo`, `getblock`, `getrawmempool`, etc. |
| `rpc/mining.cpp` | `getblocktemplate`, `submitblock`, miner-facing RPCs. |
| `rpc/net.cpp` | `getpeerinfo`, `addnode`. |
| `rpc/rawtransaction.cpp` | `decoderawtransaction`, `sendrawtransaction`. |
| `rpc/misc.cpp` | Everything else (e.g. `validateaddress`). |
| `rpc/register.h` | Registration of command tables. |

The wallet RPCs are in `wallet/rpcwallet.cpp`, `wallet/rpcdump.cpp`,
`wallet/rpcdisclosure.cpp`.

### Storage and serialisation

| File | Role |
|------|------|
| `dbwrapper.{h,cpp}` | LevelDB C++ wrapper. |
| `leveldb/` | Vendored LevelDB. |
| `crc32c/` | Vendored CRC32C used by LevelDB and elsewhere. |
| `streams.h`, `streams_rust.cpp` | Serialisation streams (binary, hash, size-only) and their Rust bridges. |
| `serialize.h` | The Bitcoin-style `READWRITE` macros. Every consensus structure is serialised through these. |

### Utility, support

| File | Role |
|------|------|
| `util/system.{cpp,h}` | Arg parsing, `gArgs`, daemonisation. |
| `util/strencodings.{cpp,h}` | Hex, base32/64. |
| `util/moneystr.{cpp,h}` | Money formatting. |
| `util/time.{cpp,h}` | Monotonic time, mock time for tests. |
| `util/match.h` | `std::visit` helpers. |
| `support/` | Allocator, lockedpool (BDB-friendly secure memory), cleanse. |
| `compat/` | `byteswap.h`, `endian.h`, `sanity.cpp`. |
| `crypto/` | Hash functions; see chapter 06. |
| `secp256k1/` | Vendored libsecp256k1 (transparent ECDSA). |
| `univalue/` | Vendored UniValue (JSON for RPC). |
| `random.{cpp,h}` | `GetRandBytes`, `FastRandomContext`, the central RNG abstraction. |
| `sync.{cpp,h}` | Mutex types (`CCriticalSection`, `LOCK` macros). |
| `scheduler.{cpp,h}` | A small task scheduler used by validationinterface and the address relay throttle. |
| `tinyformat.h` | The `tfm::format` printf-alike used everywhere. |
| `uint256.{cpp,h}`, `uint252.h`, `arith_uint256.{cpp,h}` | Fixed-width unsigned integers; `uint256` is the canonical 256-bit hash type. |
| `prevector.h` | A small-buffer-optimised vector used in serialisation hotspots. |
| `cuckoocache.h` | An approximate set used by `sigcache`. |
| `logging.{cpp,h}` | The C++ logger; tracing is in Rust (see below). |
| `metrics.{cpp,h}` | Prometheus metrics; the actual exporter is in Rust. |
| `clientversion.{cpp,h}` | Version strings reported on the wire and via RPC. |

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

Read these before reading `main.cpp`. They are the language `main.cpp` is
written in.

#### `src/zcash/`

C++ types and logic that are Zcash-specific but live on the C++ side rather
than the Rust side (mostly historical: things written before librustzcash
existed).

```
Address.{hpp,cpp}            address types, ReceiverIterator
Note.{hpp,cpp}               Sprout/Sapling note types (C++ side)
NoteEncryption.{hpp,cpp}     Sprout note encryption (Sapling/Orchard live in Rust)
JoinSplit.{hpp,cpp}          Sprout JoinSplit logic
Proof.hpp                    BN254 group elements and Sprout proof wrappers
IncrementalMerkleTree.{hpp,cpp}  the C++ Merkle tree (still used by Sprout)
History.{hpp,cpp}            ZIP-221 history MMR shims to Rust
cache.{h,cpp}                proof and signature caches
prf.{h,cpp}                  Sprout PRFs
util.{h,cpp}                 misc helpers
Zcash.h                      a tiny umbrella header (network defaults)

address/
    sprout.{hpp,cpp}, sapling.{hpp,cpp}, orchard.{hpp,cpp},
    transparent.{h,cpp}, unified.{h,cpp},   one file per receiver kind
    mnemonic.{h,cpp}                        BIP-39 mnemonic
    zip32.{h,cpp}                           ZIP-32 hierarchical deterministic keys
```

The naming is inconsistent (`.hpp` vs `.h`). That is historical and is not
worth fixing now.

#### `src/crypto/`

Symmetric primitives and hashes used directly by C++. Anything that the Rust
side already provides is preferred to live in Rust.

```
sha256.{h,cpp}, sha256_avx2.cpp, sha256_sse4.cpp, sha256_sse41.cpp, sha256_shani.cpp
sha512.{h,cpp}, sha1.{h,cpp}, ripemd160.{h,cpp}
hmac_sha256.{h,cpp}, hmac_sha512.{h,cpp}
chacha20.{h,cpp}
aes.{h,cpp}              wrapper around ctaes/
ctaes/                   constant-time AES
equihash.{h,cpp,tcc}     PoW; uses BLAKE2b from rust/blake2b.h
```

BLAKE2b lives on the Rust side (`src/rust/src/blake2b.rs`) but is consumed
by C++ via cxx (see `src/rust/include/rust/blake2b.h`).

#### `src/wallet/`

The legacy wallet. Single-user, BDB-backed, lock-protected.

```
wallet.{h,cpp}                 the giant CWallet class
walletdb.{h,cpp}               BDB-backed persistent storage
db.{h,cpp}                     BDB wrapper
crypter.{h,cpp}                wallet encryption (AES with a key from the user passphrase)
orchard.{h,cpp}                Orchard-specific wallet integration (calls into Rust)
memo.h                         Zcash memo field type
paymentdisclosure*             ZIP-308 payment disclosure (optional auditing)
rpcwallet.cpp, rpcdump.cpp, rpcdisclosure.cpp   wallet RPC commands
asyncrpcoperation_*.cpp        long-running operations (sendmany, mergetoaddress, ...)
wallet_tx_builder.cpp          new transaction builder used by the async ops
test/, gtest/                  wallet-specific test suites
```

You will spend more time here than you expect. The wallet is where most
real-world bug reports land.

#### `src/rust/`

The Rust portion of zcashd. Layout:

```
src/rust/Cargo*                 (driven from the top-level Cargo.toml)
src/rust/include/rust/          hand-written C headers for the extern "C" FFI
src/rust/src/rustzcash.rs       the main FFI module (extern "C" exports)
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
src/rust/src/metrics_ffi.rs     metrics(Rust) -> Prometheus exporter

src/rust/bin/inspect/main.rs    the zcash-inspect debug CLI
src/rust/bin/wallet_tool.rs     the zcashd-wallet-tool migration helper
src/rust/tests/                 Rust-side tests (integration with C++ stubs)
```

The single thing to internalise: **the boundary**. The C++ side owns
networking, validation state machine, wallet storage, mempool, RPC dispatch.
The Rust side owns most of the cryptography (Sapling, Orchard, Halo 2,
JoinSplit verifier glue, batch validators, note encryption, BLAKE2b,
ed25519, history tree). Cross-language calls are expensive and rare on hot
paths; batch validators amortise the cost.

#### `src/policy/`

Mempool acceptance policies (above and beyond consensus). Fee policy,
standard-transaction predicates.

#### `src/pow/`

```
pow/tromp/             a vendored equihash solver (John Tromp's)
```

The solver is only built when `--enable-mining` is on. The verifier lives in
`src/crypto/equihash.cpp`.

#### `src/zmq/`

ZMQ publisher for block/tx notifications. Off by default. Documented in
`doc/zmq.md`.

#### `src/fuzzing/`

Fuzz targets. Built separately via the AFL/libFuzzer harnesses in
`zcutil/afl/` and `zcutil/libfuzzer/`.

#### `src/bench/`

Microbenchmarks. Built as `bench_bitcoin`. Used for performance regression
tracking on hashes, signature verification, mempool insertion, etc.

#### `src/gtest/` and `src/test/`

Two parallel C++ unit-test suites; see chapter 09. The Bitcoin-Core
inherited one uses Boost.Test; the Zcash-added one uses GoogleTest.

## How to navigate

Tools that are worth setting up before reading anything else:

1. **ctags or rtags.** `ctags -R src/` gives jump-to-definition for the
   whole tree. `rtags` is more accurate but heavier.
2. **`grep`/`rg` muscle memory.** Most navigation is `rg "ProcessMessage" src/`
   followed by reading 50-200 lines of context. Get comfortable with it.
3. **An LSP setup.** clangd works if you generate a `compile_commands.json`
   (use `bear -- ./zcutil/build.sh`). rust-analyzer works out of the box
   for the Rust side, but it cannot see across the FFI boundary.
4. **`cscope` or `clangd` cross-references.** Necessary for the dozens of
   places where a function is declared in one header and used everywhere.

A good first read-through of a single feature looks like:

```
1. Read the relevant section of the Protocol Specification.
2. Find the consensus structure in src/primitives/ or src/consensus/.
3. Find the validation function in src/main.cpp (CheckTransaction,
   ContextualCheckTransaction, ConnectBlock).
4. Follow any call into src/rust/src/*_ffi.rs.
5. Find the corresponding ZIP and re-read.
6. Run the gtest or RPC test that exercises the feature.
```

Do this for one feature end to end before trying to read more broadly. A
good first feature to trace is `ContextualCheckTransaction` for a Sapling
transaction; it touches consensus, the version-group logic, the Rust
verifier, and the proof cache, but is small enough to hold in your head.
