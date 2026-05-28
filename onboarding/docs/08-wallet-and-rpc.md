---
sidebar_position: 8
title: "Wallet and RPC"
description: "CWallet, BerkeleyDB storage, async RPC operations, ZIP-32 / ZIP-316, the WalletTxBuilder, and the JSON-RPC surface."
---

# Wallet and RPC

## 1. Why this chapter exists

zcashd ships with a built-in wallet. It is a single-user,
file-backed, BerkeleyDB-stored wallet that has accumulated a great
deal of historical behaviour. The RPC interface is the primary
integration surface for exchanges, custodians, and tooling. Most
user-visible bugs land in either the wallet or the RPC, so this is
where contributors will spend more time than they expect.

## 2. Definitions

**Definition 8.1 (CWallet).** The C++ class
[CWallet](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/wallet/wallet.h)
holding the full state of one wallet: all addresses (transparent,
Sapling, Orchard, unified), spending and viewing keys, the in-memory
Sprout/Sapling/Orchard incremental Merkle trees with witnesses, the
set of unspent notes, and a `mapWallet` of known transactions.
Subscribes to `validationinterface.cpp`.

**Definition 8.2 (Async RPC operation).** A long-running task
(`AsyncRPCOperation`) that runs on a thread pool out of process from
the RPC server. Clients receive an operation ID and poll with
`z_getoperationstatus`. Examples: `z_sendmany`, `z_mergetoaddress`,
`z_shieldcoinbase`, `saplingmigration`.

**Definition 8.3 (ZIP-32 derivation).** Hierarchical deterministic
key derivation for shielded keys. Mirrors BIP-32 but produces Sapling
or Orchard extended keys. Each pool branches independently from the
seed. Implemented in `src/zcash/address/zip32.{h,cpp}` (C++) and
`zcash_primitives::zip32` (Rust).

**Definition 8.4 (Unified Address, ZIP-316).** A single encoded
string holding one receiver of each supported type (transparent,
Sapling, Orchard). The encoding uses F4Jumble (a four-round Feistel
over the encoded bytes) to make the address malleability-resistant.

## 3. The code

### Wallet design

#### Files

```
src/wallet/wallet.{h,cpp}              the CWallet class (large)
src/wallet/walletdb.{h,cpp}            BDB-backed persistence
src/wallet/db.{h,cpp}                  BDB wrapper
src/wallet/crypter.{h,cpp}             passphrase-based wallet encryption
src/wallet/orchard.{h,cpp}             Orchard-specific wallet glue
src/wallet/wallet_tx_builder.{h,cpp}   modern transaction builder
src/wallet/asyncrpcoperation_*.{h,cpp} long-running operations
src/wallet/paymentdisclosure*          ZIP-308 payment disclosure
src/wallet/rpcwallet.cpp               wallet RPC commands
src/wallet/rpcdump.cpp                 import/export keys, dumpwallet
src/wallet/rpcdisclosure.cpp           payment disclosure RPCs
```

```cpp reference title="src/wallet/wallet.h (CWallet declaration)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/wallet/wallet.h#L1-L100
```

#### Storage

The wallet is stored in `wallet.dat` (BDB). Records are typed; each
record has a key tag like `"key"` (transparent secret key),
`"sapext"` (Sapling extended key), `"orchard_ext"` (Orchard extended
key), `"tx"` (a `CWalletTx`), `"hdseed"`, etc.
`src/wallet/walletdb.cpp` is the serialiser/deserialiser.

BDB is legacy. Bitcoin Core moved to sqlite years ago. ZODL will
eventually need to either move zcashd's wallet to sqlite (large,
risky) or replace the wallet entirely with one that lives in Rust
(this is the long-term direction; the `zcashd_orchard` Rust module
and the new `zcashd-wallet-tool` hint at it).

#### Encryption

```cpp reference title="src/wallet/crypter.h (CCrypter)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/wallet/crypter.h#L1-L80
```

`CCrypter` performs AES-256-CBC encryption of secret keys using a
passphrase-derived key. The KDF is
iterated SHA-512 (Bitcoin's original PBKDF-ish construction, not
PBKDF2). The encrypted wallet still stores the public-key material
in plaintext, so unlocking is only needed for spending, not for
receiving or scanning.

The `lockedpool` allocator keeps the unlocked passphrase and the
derived AES key out of swap.

#### Async operations

Several wallet operations take long enough that they cannot block
the RPC server. The async-RPC infrastructure
(`src/asyncrpcoperation.{h,cpp}`, `src/asyncrpcqueue.{h,cpp}`) runs
them on a separate thread pool and returns an opaque operation ID.
The caller polls with `z_getoperationstatus` /
`z_getoperationresult`.

Each operation is a class extending `AsyncRPCOperation`, e.g.
`AsyncRPCOperation_sendmany`. They share a common helper
`AsyncRPCOperation_common` for the proof-related plumbing.

#### The transaction builder

The modern path for building a shielded transaction is
`WalletTxBuilder` (`src/wallet/wallet_tx_builder.cpp`). It collects
inputs, calls into the Rust builder
(`src/transaction_builder.cpp` to
`zcash_primitives::transaction::builder`), constructs proofs (via
Rust prover handles in `src/rust/src/sapling.rs`), and signs.

```cpp reference title="src/wallet/wallet_tx_builder.h (WalletTxBuilder interface)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/wallet/wallet_tx_builder.h#L1-L80
```

Older code paths (the v4-and-earlier builder) exist but are
gradually being unified.

#### Reorgs and conflicts

If a reorg removes a block that contained a wallet transaction, the
wallet marks that transaction "abandoned" (or, if it conflicts with
a new chain, "conflicted"). The Sapling and Orchard nullifier sets
in the wallet must roll back as well so that previously-spent notes
are spendable again. This is handled in
`CWallet::BlockDisconnected` and friends. Historically, bugs here
have caused user-visible "lost coins" reports.

### Key management

#### BIP-32 (transparent)

`src/key.cpp` and `src/wallet/wallet.cpp::DeriveNewChildKey`
implement BIP-32 for transparent addresses. The wallet has a single
HD seed; new addresses are derived as children of the seed.

#### ZIP-32 (shielded)

`src/zcash/address/zip32.{h,cpp}` is the C++ ZIP-32 hierarchy. The
Rust side has `zcash_primitives::zip32`. ZIP-32 defines hierarchical
deterministic key derivation for Sapling, mirroring BIP-32; the
"diversified addresses" feature means one extended viewing key can
yield many independent payment addresses.

ZIP-32 also covers Orchard, with a separate per-pool branching from
the seed.

#### ZIP-316 (unified addresses)

`src/zcash/address/unified.{h,cpp}` implements ZIP-316: a single
encoded string holds one receiver of each supported type, and the
wallet can decode and use whichever it prefers. The encoding uses
F4Jumble.

A Unified Viewing Key (UVK) and Unified Full Viewing Key (UFVK) are
similarly bundled.

#### BIP-39 mnemonics

`src/zcash/address/mnemonic.{h,cpp}` plus
`src/rust/src/zip339_ffi.rs` implement BIP-39 mnemonic phrase
generation and recovery.

### Addresses you will see

| Format | What |
|--------|------|
| `t1...` | transparent P2PKH on mainnet |
| `t3...` | transparent P2SH on mainnet |
| `tm...`, `t2...` | transparent on testnet/regtest |
| `zc...` | Sprout address (legacy) |
| `zs...` | Sapling address |
| `u1...` | Unified Address (mainnet) |
| `utest1...` | Unified Address (testnet) |
| `zviews...`, `zxviews...` | Sapling viewing key, extended viewing key |
| `uview1...`, `uivk1...`, `ufvk1...` | Unified viewing keys (ZIP-316) |

Read `src/key_io.cpp` for the encoding/decoding entry points.

### RPC

```cpp reference title="src/rpc/server.h (CRPCCommand and CRPCTable)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rpc/server.h#L1-L100
```

zcashd speaks JSON-RPC 1.0 over HTTP. The server is in
[src/rpc/server.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rpc/server.cpp)
and
[src/httprpc.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/httprpc.cpp).
Authentication is HTTP Basic with credentials from
`~/.zcash/.cookie` (auto-generated) or from
`-rpcuser`/`-rpcpassword`/`-rpcauth`.

#### Command tables

Each module registers commands at startup:

```
src/rpc/blockchain.cpp     getblock, getblockchaininfo, getrawmempool, ...
src/rpc/mining.cpp         getblocktemplate, submitblock, getmininginfo
src/rpc/net.cpp            getpeerinfo, addnode, getconnectioncount
src/rpc/rawtransaction.cpp createrawtransaction, decoderawtransaction, sendrawtransaction
src/rpc/misc.cpp           validateaddress, signmessage, verifymessage
src/wallet/rpcwallet.cpp   z_sendmany, z_getbalance, z_listunspent, ...
src/wallet/rpcdump.cpp     importprivkey, dumpwallet, z_importwallet
src/wallet/rpcdisclosure.cpp z_getpaymentdisclosure, z_validatepaymentdisclosure
```

The `register.h` and per-module `Register*RPCCommands` glue
assembles them into `tableRPC`.

#### Adding a new RPC

The pattern in any of the above files:

```cpp
UniValue mycommand(const UniValue& params, bool fHelp) {
    if (fHelp || params.size() != N) {
        throw runtime_error(R"(usage and docstring)");
    }
    LOCK(cs_main);  // or whatever locks apply
    // ... do work
    return result;  // UniValue
}

static const CRPCCommand commands[] = {
    { "mycategory", "mycommand", &mycommand,
      true /* okSafeMode */, {"arg1", "arg2"} },
};

void RegisterMyRPCCommands(CRPCTable& t) {
    for (auto& cmd : commands) { t.appendCommand(cmd.name, &cmd); }
}
```

All RPC commands that touch the wallet must check
`EnsureWalletIsAvailable` and respect the wallet lock.

#### Deprecation flags

Some RPCs and behaviours are gated by `-allowdeprecated=...`. Read
`src/deprecation.{h,cpp}` and the `GetAllowableDeprecatedFeatures()`
list. ZODL will be the entity deciding when to remove deprecated
features; do so with at least a release of warning.

#### Important Zcash-specific RPCs

```
z_sendmany           main shielded send command (now uses WalletTxBuilder)
z_getbalance         balance per address (transparent, Sapling, Orchard, unified)
z_listunspent        per-pool unspent notes
z_listaddresses      enumerate addresses
z_getnewaccount      new ZIP-316 account
z_getaddressforaccount   derive a unified address from an account
z_mergetoaddress     consolidate notes
z_shieldcoinbase     shield coinbase outputs
z_validatepaymentdisclosure   verify a ZIP-308 disclosure
getblocktemplate     for miners, returns coinbase template including funding streams
```

The RPC reference is browseable via `zcash-cli help` or `zcash-cli
help <command>`. There is no auto-generated docs site.

### ZMQ

Optional ZMQ publisher in `src/zmq/`. When enabled with
`-zmqpubrawblock=...` or similar, the node publishes serialised
blocks/transactions to a ZMQ socket. Useful for downstream consumers
(block explorers, mempool monitors) that do not want to poll RPC.
See `doc/zmq.md`.

### REST

A minimal REST interface in `src/rest.cpp`: `/rest/block/HASH.bin`,
`/rest/tx/TXID.json`, etc. Read-only, no auth. Off by default
(`-rest=1`).

### zcash-cli, zcash-tx

`zcash-cli` is a thin RPC client; nothing controversial. `zcash-tx`
constructs and inspects raw transactions without needing a running
node; it does NOT support shielded operations and only handles
transparent transaction surgery. See `src/bitcoin-tx.cpp`.

### Tooling binaries

In `src/rust/bin/`:

- `wallet_tool.rs` -> `zcashd-wallet-tool`. Helper for wallet
  migration, address derivation, viewing-key import/export.
- `inspect/main.rs` -> `zcash-inspect`. Debug Swiss army knife that
  decodes raw transactions, blocks, keys, addresses. The most useful
  CLI for incident response.

## 4. Failure modes

- **Holding the wallet lock across an FFI call.** Deadlocks the node
  if the FFI side waits on the wallet. Caught by:
  `qa/rpc-tests/wallet_*.py` sometimes; otherwise empirical.
- **Forgetting to roll back nullifier sets on disconnect.** Causes
  user-visible "lost coins" or "double spend" reports. Caught by:
  `qa/rpc-tests/wallet_doublespend.py`, partly.
- **Bypassing `EnsureWalletIsAvailable` in a new wallet RPC.** Crash
  on `nullptr` if the daemon was started with `-disablewallet`.
  Caught by: review only.
- **Writing a new RPC whose response leaks secret data.** Easy to do
  with new fields. Caught by: review and `gettransaction` regression
  tests.
- **Adding a wallet field without a `walletdb.cpp` (de)serialiser
  entry.** Wallet fails to load. Caught at first startup.

## 5. Spec pointers

- [ZIP-32](https://zips.z.cash/zip-0032): hierarchical deterministic
  shielded keys.
- [ZIP-316](https://zips.z.cash/zip-0316): unified addresses, unified
  viewing keys.
- [ZIP-317](https://zips.z.cash/zip-0317): revised fee policy.
- [ZIP-308](https://zips.z.cash/zip-0308): payment disclosure.
- [BIP-32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki).
- [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki).

## 6. Exercises

1. **Trace a `z_sendmany`.** Walk through one `z_sendmany` call from
   `src/wallet/rpcwallet.cpp` into `AsyncRPCOperation_sendmany`,
   then into `WalletTxBuilder`, then into the Rust builder.
   Identify every cross-language hop.

2. **Decode a unified address.** Use
   [src/rust/bin/inspect/main.rs](https://github.com/zcash/zcash/tree/v5.5.0-rc1/src/rust/bin/inspect)
   to decode `u1...` into its component receivers. Cross-check
   against [ZIP-316](https://zips.z.cash/zip-0316).

3. **Add a wallet RPC.** Add `z_walletinfo` that returns the count
   of Sapling and Orchard notes by status (unspent, locked,
   pending). Pattern: copy `getwalletinfo` in
   `src/wallet/rpcwallet.cpp`, add the new fields. Verify on
   regtest.

4. **Modification exercise.** Patch
   `CWallet::BlockDisconnected` to log every nullifier it rolls
   back at DEBUG level. Construct a regtest reorg and confirm the
   log is balanced (the same nullifiers are re-added when blocks
   reconnect).

## 7. Further reading

- The Sapling/Orchard sections of the protocol spec for the key
  derivation math.
- ECC blog posts on the new wallet architecture and the move toward
  the Rust-native wallet.
- Bitcoin Core's
  [src/wallet/](https://github.com/bitcoin/bitcoin/tree/master/src/wallet)
  for the post-sqlite design and the descriptor wallet, which zcashd
  may move toward.
