---
sidebar_position: 8
title: "Storage"
description: "What zcashd actually saves to disk, where, and how to inspect it. Split between protocol storage (blocks, chainstate, params), optional indexing storage, and wallet storage."
---

# Storage

## 1. Why this chapter exists

A running zcashd writes several kinds of state to disk, and a
reader who confuses one for another will mis-diagnose every
operational problem. The chainstate has different durability
properties from the wallet, the wallet has different durability
properties from the optional indexes, and `mempool.dat` is not
the same thing as the mempool in memory. This chapter draws the
map and shows the commands to inspect each store.

The split below mirrors the access pattern: **protocol storage**
(must agree byte-for-byte with every other validating node),
**indexing storage** (optional, local, off by default,
re-buildable), **wallet storage** (single-user secrets), and
**operational storage** (peers, banlist, debug log).

## 2. Definitions

**Definition 8.1 (Datadir).** The single directory that holds all
node state, default `~/.zcash` on Linux. Overridable with
`-datadir=<path>` on the command line. Network-specific state
lives under `testnet3/` or `regtest/` subdirectories.

**Definition 8.2 (Chainstate).** The LevelDB database
`<datadir>/chainstate/` containing the UTXO set, per-pool
nullifier sets, per-pool anchor sets, the per-block note
commitment tree roots, and the best-block pointer. It is the
authoritative consensus state of a synced node.

**Definition 8.3 (Block index).** The LevelDB database
`<datadir>/blocks/index/` mapping each block hash to a
`CBlockIndex` record (height, file offset, status flags,
cumulative work). Lets the node find a block on disk by hash
without scanning every `blk?????.dat` file.

**Definition 8.4 (Index databases).** Optional secondary LevelDB
databases (`<datadir>/blocks/index/` already exists by default;
others are off by default and enabled per-flag) that map external
queries (txid -> location, address -> transaction list,
timestamp -> block) to chain data. Indexes are local; they are
not consensus; they can be rebuilt from chain data with
`-reindex`.

**Definition 8.5 (Wallet file).** `<datadir>/wallet.dat`. A
BerkeleyDB 6.2 database holding the user's keys, addresses,
transaction history, witnesses, and HD seed. Per-user secret.
Never shared across nodes.

## 3. The code and the on-disk layout

### Datadir layout (mainnet)

```
~/.zcash/
  blocks/
    blk00000.dat            # raw serialised blocks, append-only
    blk00001.dat
    ...
    rev00000.dat            # undo data for block disconnects
    rev00001.dat
    ...
    index/                  # LevelDB; block hash -> CBlockIndex
  chainstate/               # LevelDB; UTXO + nullifiers + anchors
  database/                 # BDB log files for the wallet
  wallet.dat                # BDB; the legacy wallet
  banlist.dat               # serialised CBanEntry list
  peers.dat                 # serialised addrman state
  mempool.dat               # mempool snapshot (loaded on startup)
  fee_estimates.dat         # serialised fee estimator state
  zcash.conf                # operator's config file (READ at startup)
  zcashd.pid                # PID of the running daemon
  debug.log                 # main log
  .cookie                   # RPC auth cookie (random per run, mode 0600)
  .lock                     # filesystem lock so two daemons cannot share
```

Testnet adds a `testnet3/` prefix; regtest uses `regtest/`. The
shared params at `~/.zcash-params/` (Sprout-Groth16, Sapling
proving and verifying keys) are SEPARATE from the datadir and
shared across all networks; they are downloaded once by
`zcutil/fetch-params.sh`.

### Protocol storage

This is the storage the protocol requires every node to keep
consistent. Lose it or corrupt it and the node cannot validate
new blocks.

#### Raw block files: `blocks/blk?????.dat`

Append-only flat files holding serialised blocks in chain order
as they were received. Each file caps at ~128 MiB; once full, a
new `blkNNNNN.dat` is started. The block index records the
`(file, offset)` of each block so that random access is one seek.

```cpp reference title="src/main.cpp (FindBlockPos: block file allocation)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/main.cpp#L4756-L4860
```

Companion `rev?????.dat` files hold **undo data**: the inputs
that each block consumed, plus per-pool tree state needed to
rewind on `DisconnectBlock`. They are essential for reorgs.

Inspect:

```bash
ls -lh ~/.zcash/blocks/blk*.dat
# Raw bytes; not directly useful. Use RPC:
zcash-cli getblock <hash> 0           # raw hex
zcash-cli getblock <hash> 1           # parsed JSON
zcash-cli getblockcount
zcash-cli getbestblockhash
```

#### Block index: `blocks/index/`

LevelDB. Keys begin with `b` followed by the block hash; values
are serialised `CBlockIndex` records. Read via
`CBlockTreeDB::ReadBlockIndex`.

```cpp reference title="src/txdb.h (CBlockTreeDB, ReadBlockIndex)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/txdb.h#L1-L120
```

The block index also stores: file information (`f` prefix), the
"reindex needed" flag (`R`), the last block file number (`l`),
and the optional indexes' enable flags.

#### Chainstate: `chainstate/`

LevelDB. The consensus-critical state. Keys, with byte prefixes:

```
'C' + COutPoint  -> Coin                  (the transparent UTXO entry)
'B' -> uint256                            (best block hash)

# Per-pool sets (Sprout, Sapling, Orchard):
's' + nullifier  -> 1                     (Sprout nullifier set)
'S' + anchor     -> SaplingMerkleTree     (Sapling anchor -> stored tree state)
'O' + nullifier  -> 1                     (Sapling nullifier set; varies by version)
... etc
```

Exact prefix bytes are defined in
[src/txdb.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/txdb.cpp);
look for the `DB_*` constants:

```cpp reference title="src/txdb.cpp (DB_* prefix constants)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/txdb.cpp#L1-L80
```

The chainstate is read through `CCoinsViewDB` (the LevelDB
backing) layered under `CCoinsViewCache` (the in-memory cache):

```cpp reference title="src/coins.h (CCoinsView, CCoinsViewCache, CCoinsViewDB)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/coins.h#L363-L600
```

Note commitment tree roots (see
[chapter 07](./07-zk-proofs-and-pools.md#anchors-and-note-commitment-trees))
are stored alongside the UTXO entries: the chainstate is the
single store responsible for the entire post-block consensus
state.

Inspect:

```bash
# High-level summary; iterates the entire UTXO set so SLOW on mainnet
zcash-cli gettxoutsetinfo

# Pool balances (Sprout / Sapling / Orchard)
zcash-cli getblockchaininfo | jq '.valuePools'

# Per-block roots
zcash-cli getblock <hash> 1 | jq '.finalsaplingroot, .finalorchardroot'

# Raw LevelDB inspection (read-only; do not run against a running node)
zcashd -datadir=/path/to/snapshot -reindex-chainstate
```

Direct LevelDB scans require the daemon to be stopped (the
exclusive lock is held while running). The Python `plyvel`
library plus the
[src/txdb.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/txdb.cpp)
prefix table lets you build a scanner; ZODL has not (yet)
published a vetted tool.

#### Sapling and Orchard parameters: `~/.zcash-params/`

NOT in the datadir. Downloaded once by
`zcutil/fetch-params.sh`:

```
~/.zcash-params/
  sprout-groth16.params         (884 MB)
  sapling-spend.params          (47 MB)
  sapling-output.params         (3.4 MB)
```

Loaded at daemon startup by `librustzcash_init_zksnark_params`.
A node that lacks them refuses to start.

Inspect:

```bash
sha256sum ~/.zcash-params/*
# Expected hashes are published; see zcutil/fetch-params.sh for the
# canonical list.
```

#### Note-commitment-tree state

The Sapling and Orchard frontiers (the rightmost-path
representations described in
[chapter 07](./07-zk-proofs-and-pools.md#the-trees-themselves))
are stored INSIDE the chainstate under their own key prefixes.
They are not a separate file; they piggyback on `chainstate/`
because they evolve in lockstep with each block.

### Indexing storage

Optional, off by default, never consensus. Indexes accelerate
queries that map external identifiers to chain data. None of
these are required for validation; rebuild with `-reindex` or
`-reindex-chainstate` if lost.

#### Transaction index (`-txindex`)

When on, maintains a LevelDB index under `blocks/index/` mapping
`txid -> (block file, offset, length)`. Without `-txindex`, the
node can only retrieve transactions that are in the mempool or
in the wallet.

```bash
# Enable in zcash.conf
txindex=1
# Then restart and let it rebuild (slow first time)

# Required for:
zcash-cli getrawtransaction <txid>     # by hash, any chain location
```

Programmatic write path:

```cpp reference title="src/txdb.cpp (CBlockTreeDB read/write methods)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/txdb.cpp#L321-L420
```

#### Address index (`-addressindex`)

Maps transparent script hash -> list of `(height, txid, vout,
value)`. Required for the explorer-style RPCs
`getaddresstxids`, `getaddressbalance`, `getaddressutxos`,
`getaddressdeltas`. Off by default; large on mainnet (tens of
GiB).

The on-disk types are declared at
[src/addressindex.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/addressindex.h):

```cpp reference title="src/addressindex.h (CAddressIndexKey, CAddressIndexIteratorKey)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/addressindex.h#L1-L100
```

#### Spent index (`-spentindex`)

Maps an outpoint to the transaction that spent it. Required for
`getspentinfo`. Same backing store as `addressindex`. Useful for
forensic tools that need to walk "where did this coin go".

#### Timestamp index (`-timestampindex`)

Maps timestamps to block hashes for fast "block at time T"
lookups. Used by some block explorers.

#### Insight-style indexes

Several of the above were imported from Bitcoin's Bitcore /
Insight forks. Their on-disk format is documented in
[src/addressindex.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/addressindex.h),
[src/spentindex.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/spentindex.h),
and
[src/timestampindex.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/timestampindex.h).

#### Reindex flow

```bash
zcashd -reindex                   # rebuild block index AND chainstate
zcashd -reindex-chainstate        # rebuild only chainstate (faster)
```

`-reindex` reads every `blk?????.dat` from scratch; on mainnet
expect several hours.

### Wallet storage

The wallet is a separate persistence layer, owned by the user,
on the same machine but conceptually independent.

#### `wallet.dat` (BerkeleyDB 6.2)

A typed key-value store. Each record is a tagged tuple:

```
"hdseed"    -> the master HD seed (encrypted if wallet is encrypted)
"key"       -> a transparent (private, public) keypair
"sapext"    -> a Sapling extended spending key
"orchard_*" -> Orchard keys (varies)
"tx"        -> a CWalletTx record
"name"      -> a label for an address
"acentry"   -> an account entry (legacy)
"flags"     -> wallet feature flags (encrypted, HD, etc.)
"version"   -> on-disk wallet version
"mkey"      -> a wrapped key (when wallet is passphrase-encrypted)
"ckey"      -> a crypted private key
"witnesscache_v3" -> serialised Sapling/Orchard witness cache
... and many more
```

The full key tag list is in
[src/wallet/walletdb.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/wallet/walletdb.cpp):

```cpp reference title="src/wallet/walletdb.cpp (CWalletDB record tags)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/wallet/walletdb.cpp#L1-L120
```

The serialised wallet types live in
[src/wallet/walletdb.h](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/wallet/walletdb.h):

```cpp reference title="src/wallet/walletdb.h (class CWalletDB)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/wallet/walletdb.h#L400-L498
```

#### BDB on-disk realities

BerkeleyDB 6.2 maintains a `<datadir>/database/` directory of log
files alongside `wallet.dat`. These logs must be preserved
together; copying only `wallet.dat` while the daemon is running
gives a partial state. Always stop the daemon, or use the
"backup wallet" RPC:

```bash
zcash-cli backupwallet /tmp/backup-wallet.dat
```

`backupwallet` performs a transactional checkpoint and writes a
self-contained copy.

#### Encryption

A passphrase-encrypted wallet protects the *secret* records
(spending keys, HD seed). Public material (addresses, viewing
keys, transaction metadata) is plaintext on disk. This is by
design: the node must be able to scan for incoming notes without
the passphrase.

The encryption flow is in
[src/wallet/crypter.{h,cpp}](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/wallet/crypter.h):
AES-256-CBC over a passphrase-derived key (iterated SHA-512).

#### Witness data

For each unspent Sapling and Orchard note, the wallet stores an
authentication path from the note's commitment to a recent
anchor. The serialised form lives under the `witnesscache_v3`
key (and earlier `v2`, `v1` for legacy data); the in-memory
representation is in
[src/rust/src/wallet.rs](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/wallet.rs).

Witnesses are derivable from chain data; a wallet that loses
them can rebuild by rescanning (`-rescan`). They are stored
explicitly because rescanning the chain is slow.

#### Inspect

```bash
zcash-cli dumpwallet /tmp/wallet-dump.txt    # human-readable secrets export
zcash-cli z_exportwallet /tmp/zwallet.txt    # shielded keys included
zcashd-wallet-tool ...                       # offline migrations
```

For raw BDB inspection (daemon stopped):

```bash
db_dump -p wallet.dat | less
# Note: BDB on-disk format is opaque without zcashd-side knowledge.
# Prefer dumpwallet / z_exportwallet wherever possible.
```

### Operational storage

#### `peers.dat`

Serialised `CAddrMan` state: the new/tried tables of known peer
addresses. Written periodically and on shutdown by
`CAddrDB::Write`:

```cpp reference title="src/addrdb.h (class CAddrDB)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/addrdb.h#L81-L103
```

Lose it and the node will rebootstrap from DNS seeds on next
start.

#### `banlist.dat`

Serialised list of banned peers (with expiry times). Written by
`CAddrDB::DumpBanlist`.

#### `mempool.dat`

Snapshot of the mempool at shutdown. Loaded on startup so that a
restarted node does not lose its mempool. Format: serialised
list of `(timestamp, fee_delta, CTransaction)`. Saved every 15
minutes and on clean shutdown.

```bash
zcash-cli getmempoolinfo
zcash-cli savemempool                         # force a snapshot
```

#### `fee_estimates.dat`

Serialised state of the fee estimator (an EMA of confirmation
times at various fee rates). Used by `estimatefee`. Rebuilt over
time; not critical.

#### `debug.log`

The main log. Default location `<datadir>/debug.log`. Rotated by
restart only (no built-in log rotation). Verbosity controlled by
`-debug=<category>` flags; the Rust subsystems route through
`tracing` and are bridged into the C++ logger in
[src/rust/src/tracing_ffi.rs](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/tracing_ffi.rs).

#### `.cookie`

Per-run RPC auth cookie. Mode 0600. Used by `zcash-cli` to
authenticate when no `-rpcuser`/`-rpcpassword` is set.

#### `.lock`

Empty file held by `flock()`. Prevents two zcashd processes from
sharing one datadir.

## A summary table

| Path | Layer | Purpose | Format | Survives across versions? |
|------|-------|---------|--------|---------------------------|
| `blocks/blk*.dat` | Protocol | Raw serialised blocks | Custom binary | Yes |
| `blocks/rev*.dat` | Protocol | Undo data for reorgs | Custom binary | Yes |
| `blocks/index/` | Protocol | Block-hash -> location index | LevelDB | Re-buildable with `-reindex` |
| `chainstate/` | Protocol | UTXOs, nullifiers, anchors, tree roots | LevelDB | Re-buildable with `-reindex-chainstate` |
| `~/.zcash-params/` | Protocol | Sapling/Sprout proving + verifying keys | Custom binary (Groth16 keys) | Yes; tied to MPC ceremony output |
| `blocks/index/` (with `-txindex`) | Indexing | txid -> location | LevelDB | Re-buildable |
| same backing (`-addressindex`) | Indexing | script -> txes | LevelDB | Re-buildable |
| same backing (`-spentindex`) | Indexing | outpoint -> spender | LevelDB | Re-buildable |
| same backing (`-timestampindex`) | Indexing | time -> blocks | LevelDB | Re-buildable |
| `wallet.dat` + `database/` | Wallet | Keys, addresses, txes, witnesses | BerkeleyDB 6.2 | Yes; user-owned |
| `peers.dat` | Operational | Addrman state | Serialised CAddrMan | Re-buildable from DNS seeds |
| `banlist.dat` | Operational | Banned peers | Serialised CBanEntry | Re-buildable |
| `mempool.dat` | Operational | Mempool snapshot at shutdown | Serialised tx list | Re-buildable |
| `fee_estimates.dat` | Operational | Fee estimator EMA | Serialised | Re-buildable |
| `.cookie` | Operational | RPC auth | Random 32 bytes | No; per-run |
| `debug.log` | Operational | Main log | Plain text | No |
| `.lock` | Operational | Process lock | Empty | No |

## 4. Failure modes

- **Corrupting `chainstate/` mid-write.** A crash during a flush
  can leave the database inconsistent. zcashd attempts to detect
  this at startup and asks the operator to `-reindex-chainstate`.
  Caught by: the on-startup integrity check in
  `CChainStateBlockHeaderTreeDB::LoadBlockIndexGuts`. No
  automated test in this workspace; caught operationally.
- **Backing up `wallet.dat` while the daemon is running.**
  Partial BDB state. Caught by: BDB refusing to open or returning
  bogus data on restore. Always use `backupwallet`.
- **Mixing chainstate from different network upgrades.** A
  chainstate built before NU5 cannot validate blocks after NU5
  without a reindex (the Orchard anchor set does not exist in
  the old chainstate). Caught by: assertion failure on the first
  v5 transaction.
- **Enabling `-txindex` after the fact without `-reindex`.** Some
  RPCs will return "no such txid" for historical transactions.
  Caught by: `getrawtransaction` failures.
- **Disk-full during block write.** Block file rotation can fail;
  the node halts with `AbortNode("Disk space too low!")`.
  Caught by: an explicit disk-space check before each block
  write.
- **Losing `peers.dat`.** Node falls back to DNS seeds. Slow
  reconnect. Not catastrophic.
- **Losing the wallet but keeping the seed.** Recoverable for
  transparent keys (re-derive via BIP-32). Recoverable for
  shielded keys (re-derive via ZIP-32, then `-rescan` to
  reconstruct witnesses). The HD seed is the single load-bearing
  secret; protect it.

## 5. Spec pointers

The protocol specification is silent on storage formats: storage
is an implementation concern. Cross-implementation interop
happens at the wire level. Useful pointers:

- [Bitcoin Core: data directory](https://en.bitcoin.it/wiki/Data_directory)
  for the inherited block file format and `peers.dat` layout
  (zcashd diverges in details, agrees in structure).
- [doc/reduce-traffic.md](https://github.com/zcash/zcash/blob/v5.5.0-rc1/doc/reduce-traffic.md)
  for the operational knobs (`-prune`, `-maxuploadtarget`).
- [doc/zmq.md](https://github.com/zcash/zcash/blob/v5.5.0-rc1/doc/zmq.md)
  for ZMQ event publishing, which is the supported way to
  consume chain events without scraping LevelDB.
- The
  [LevelDB design](https://github.com/google/leveldb/blob/main/doc/index.md)
  for the underlying engine. zcashd vendored LevelDB lives in
  [src/leveldb/](https://github.com/zcash/zcash/tree/v5.5.0-rc1/src/leveldb).

## 6. Exercises

1. **Estimate datadir size.** On a fully synced mainnet node,
   measure each subdirectory:

   ```bash
   du -sh ~/.zcash/blocks ~/.zcash/chainstate ~/.zcash/wallet.dat
   ```

   Roughly what fraction is each? Answer (typical 2026 mainnet):
   `blocks/` dominates (raw blocks), `chainstate/` is much smaller,
   `wallet.dat` depends on the user.

2. **Trace a block on disk.** Pick a recent block hash via
   `zcash-cli getbestblockhash`. Use
   `zcash-cli getblock <hash> 1` to find the height; cross-check
   the file-and-offset by reading the block-index entry via the
   debug RPC if your build supports it, otherwise via a custom
   LevelDB read against `blocks/index/`.

3. **UTXO set summary.** Run
   `zcash-cli gettxoutsetinfo` on a synced node. Note the total
   `transactions`, `txouts`, and `total_amount`. The latter must
   equal the issued subsidy minus any value locked in shielded
   pools (which is reported separately in `valuePools`).

4. **Index toggle.** Stop the daemon. Add `txindex=1` to
   `zcash.conf`. Restart with `-reindex` and time the rebuild.
   Confirm `getrawtransaction <historical_txid>` works
   afterward.

5. **Wallet backup round-trip.** Run `backupwallet
   /tmp/wallet.dat.backup`. Stop the daemon. Move the original
   `wallet.dat` aside. Copy the backup into place. Start. Verify
   `getbalance` returns the expected value and `z_listaddresses`
   returns the same set.

6. **Modification exercise.** Add a `getstoragelayout` RPC that
   returns a JSON object enumerating each of the on-disk
   artefacts in section 3 with their current size. Pattern is in
   [src/rpc/misc.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rpc/misc.cpp);
   the size lookup uses `boost::filesystem::file_size`.

## 7. Further reading

- Bitcoin Core's
  [doc/files.md](https://github.com/bitcoin/bitcoin/blob/master/doc/files.md)
  for a more complete description of the upstream datadir
  conventions zcashd inherits.
- The
  [LevelDB implementation notes](https://github.com/google/leveldb/blob/main/doc/impl.md).
- BerkeleyDB 6.2 reference for the wallet format (the legacy
  format will eventually be replaced; see
  [chapter 09](./09-wallet-and-rpc.md)).
