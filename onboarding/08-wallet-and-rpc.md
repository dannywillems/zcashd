# 08 - Wallet and RPC

zcashd ships with a built-in wallet. It is a single-user, file-backed,
BerkeleyDB-stored wallet that has accumulated a great deal of historical
behaviour. The RPC interface is the primary integration surface for
exchanges, custodians, and tooling, and most user-visible bugs land in
either the wallet or the RPC.

## Wallet design

### Files

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

### The CWallet class

`CWallet` (in `src/wallet/wallet.h`) is one of the largest classes in
the tree. It owns:

- The set of all addresses (transparent, Sapling, Orchard, unified) and
  their viewing/spending keys.
- The set of all known transactions that touch the wallet (`mapWallet`).
- The Sprout, Sapling, and Orchard incremental Merkle trees as seen
  from the wallet's perspective (with witnesses).
- The set of unspent notes.
- Pending transactions, conflicts, and reorgs.
- The wallet file lock and the in-memory caches of all of the above.

It is also a subscriber to `validationinterface.cpp`: whenever a block
is connected or disconnected, the wallet is notified and updates its
state.

### Storage

The wallet is stored in `wallet.dat` (BDB). Records are typed; each
record has a key tag like `"key"` (transparent secret key), `"sapext"`
(Sapling extended key), `"orchard_ext"` (Orchard extended key),
`"tx"` (a `CWalletTx`), `"hdseed"`, etc. `src/wallet/walletdb.cpp` is
the serialiser/deserialiser.

BDB is legacy. Bitcoin Core moved to sqlite years ago. ZODL will
eventually need to either move zcashd's wallet to sqlite (large,
risky) or replace the wallet entirely with one that lives in Rust
(this is the long-term direction; the new wallet `zcashd-wallet-tool`
and the `zcashd_orchard` Rust module hint at it).

### Encryption

`CCrypter` in `src/wallet/crypter.cpp` performs AES-256-CBC encryption
of secret keys using a passphrase-derived key. The KDF is iterated
SHA-512 (Bitcoin's original PBKDF-ish construction, not PBKDF2). The
encrypted wallet still stores the public-key material in plaintext, so
unlocking is only needed for spending, not for receiving or scanning.

The `lockedpool` allocator is used to keep the unlocked passphrase and
the derived AES key out of swap.

### Async operations

Several wallet operations (sendmany, mergetoaddress, shieldcoinbase,
the Sapling migration) take long enough that they cannot block the
RPC server. The "async RPC" infrastructure
(`src/asyncrpcoperation.{h,cpp}`, `src/asyncrpcqueue.{h,cpp}`) runs
them on a separate thread pool and returns an opaque operation ID. The
caller polls with `z_getoperationstatus` / `z_getoperationresult`.

Each operation is a class extending `AsyncRPCOperation`, e.g.
`AsyncRPCOperation_sendmany`. They share a common helper
`AsyncRPCOperation_common` for the proof-related plumbing.

### The transaction builder

The modern path for building a shielded transaction is
`WalletTxBuilder` (`src/wallet/wallet_tx_builder.cpp`). It collects
inputs, calls into the Rust builder (`src/transaction_builder.cpp` ->
`zcash_primitives::transaction::builder`), constructs proofs (via
Rust prover handles in `src/rust/src/sapling.rs`), and signs.

Older code paths (the v4-and-earlier builder) exist but are gradually
being unified.

### Reorgs and conflicts

If a reorg removes a block that contained a wallet transaction, the
wallet marks that transaction "abandoned" (or, if it conflicts with a
new chain, "conflicted"). The Sapling and Orchard nullifier sets in
the wallet must roll back as well so that previously-spent notes are
spendable again. This is handled in
`CWallet::BlockDisconnected` and friends; bugs here historically have
caused user-visible "lost coins" reports.

## Key management

### BIP-32 (transparent)

`src/key.cpp` and `src/wallet/wallet.cpp::DeriveNewChildKey` implement
BIP-32 for transparent addresses. The wallet has a single HD seed; new
addresses are derived as children of the seed.

### ZIP-32 (shielded)

`src/zcash/address/zip32.{h,cpp}` is the C++ ZIP-32 hierarchy. The Rust
side has `zcash_primitives::zip32`. ZIP-32 defines hierarchical
deterministic key derivation for Sapling, mirroring BIP-32; the
"diversified addresses" feature means that one extended viewing key
can yield many independent payment addresses.

ZIP-32 also covers Orchard, with a separate per-pool branching from
the seed.

### ZIP-316 (unified addresses)

`src/zcash/address/unified.{h,cpp}` implements ZIP-316: a single
encoded string holds one receiver of each supported type (transparent,
Sapling, Orchard), and the wallet can decode and use whichever it
prefers. The encoding uses F4Jumble (a four-round Feistel over the
encoded bytes) to make the address malleability-resistant.

A Unified Viewing Key (UVK) and Unified Full Viewing Key (UFVK) are
similarly bundled.

### BIP-39 mnemonics

`src/zcash/address/mnemonic.{h,cpp}` plus `src/rust/src/zip339_ffi.rs`
implement BIP-39 mnemonic phrase generation and recovery.

## Addresses you will see

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

## RPC

zcashd speaks JSON-RPC 1.0 over HTTP. The server is in
`src/rpc/server.cpp` and `src/httprpc.cpp`. Authentication is HTTP Basic
with credentials from `~/.zcash/.cookie` (auto-generated) or from
`-rpcuser`/`-rpcpassword`/`-rpcauth`.

### Command tables

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

The `register.h` and per-module `Register*RPCCommands` glue assembles
them into `tableRPC`.

### Adding a new RPC

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
    { "mycategory", "mycommand", &mycommand, true /* okSafeMode */, {"arg1", "arg2"} },
};

void RegisterMyRPCCommands(CRPCTable& t) {
    for (auto& cmd : commands) { t.appendCommand(cmd.name, &cmd); }
}
```

All RPC commands that touch the wallet must check `EnsureWalletIsAvailable`
and respect the wallet lock.

### Deprecation flags

Some RPCs and behaviours are gated by `-allowdeprecated=...`. Read
`src/deprecation.{h,cpp}` and the `GetAllowableDeprecatedFeatures()`
list. ZODL will be the entity deciding when to remove deprecated
features; do so with at least a release of warning.

### Important Zcash-specific RPCs

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

The RPC reference is browseable via `zcash-cli help` or `zcash-cli help
<command>`. There is no auto-generated docs site.

## ZMQ

Optional ZMQ publisher in `src/zmq/`. When enabled with `-zmqpubrawblock=...`
or similar, the node publishes serialised blocks/transactions to a ZMQ
socket. Useful for downstream consumers (block explorers, mempool
monitors) that do not want to poll RPC. See `doc/zmq.md`.

## REST

A minimal REST interface in `src/rest.cpp`: `/rest/block/HASH.bin`,
`/rest/tx/TXID.json`, etc. Read-only, no auth. Off by default
(`-rest=1`).

## zcash-cli, zcash-tx

`zcash-cli` is a thin RPC client; nothing controversial. `zcash-tx`
constructs and inspects raw transactions without needing a running
node; it does *not* support shielded operations and only handles
transparent transaction surgery. See `src/bitcoin-tx.cpp`.

## Tooling binaries

In `src/rust/bin/`:

- `wallet_tool.rs` -> `zcashd-wallet-tool`. Helper for wallet
  migration, address derivation, viewing-key import/export. Useful for
  one-off operations that should not go through the running daemon.
- `inspect/main.rs` -> `zcash-inspect`. A debug Swiss army knife that
  decodes raw transactions, blocks, keys, addresses; the most useful
  CLI for incident response. Learn its flags.

## Where to start when debugging wallet issues

1. Reproduce on regtest with `-debug=wallet -debug=rpc -debug=zrpc`.
2. Read the relevant `wallet.cpp` code around the affected function.
3. Add unit tests in `src/wallet/gtest/` for hypotheses.
4. Use `zcashd-wallet-tool` and `zcash-inspect` to introspect state
   without touching the daemon.
5. If the issue might be a builder bug, isolate by constructing the
   transaction with `WalletTxBuilder` directly in a gtest.
