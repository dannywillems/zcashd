---
sidebar_position: 5
title: "P2P networking"
description: "The Bitcoin-Core-inherited peer-to-peer layer: handshake, addr/addrv2, inv/getdata, block download, mempool relay, bans, and the Bitcoin Core delta zcashd is missing."
---

# P2P networking

## 1. Why this chapter exists

The peer-to-peer layer is almost unchanged from Bitcoin Core 0.12.
Same message names, same handshake, same `addr`/`getaddr` discovery,
same INV-based block and transaction propagation. The Zcash
modifications are limited to the version-handshake parameters (a
different protocol version, a Zcash subversion), new service flags,
and Zcash-specific message handling for shielded transaction sizes.

If you have read the
[Bitcoin P2P docs](https://developer.bitcoin.org/reference/p2p_networking.html)
once, you already know 90% of what is here. This chapter fills in
the Zcash deltas and points to the BIPs zcashd does not implement.

## 2. Definitions

**Definition 5.1 (Peer).** A TCP socket pair `(local, remote)`
represented by a `CNode` instance. A node maintains up to
`DEFAULT_MAX_PEER_CONNECTIONS = 125` such instances, split into
inbound (accepted) and outbound (initiated).

**Definition 5.2 (Address manager).** `CAddrMan` keeps two tables:
a "new" table of addresses learned via `addr` from peers we have
not successfully connected to, and a "tried" table of addresses we
have successfully connected to at least once. Each table is a
fixed-size set of buckets keyed by a salted hash. Persisted to
`peers.dat`.

**Definition 5.3 (INV).** An "inventory" announcement of an object
by hash. `inv(type, hash)` with `type in {MSG_TX, MSG_BLOCK, ...}`.
The receiver requests the object via `getdata`.

**Definition 5.4 (Misbehaviour score).** A per-peer counter
incremented by `Misbehaving(nodeId, dosScore)` on specific
malformed inputs. Above `BANSCORE_THRESHOLD` the peer is banned for
`DEFAULT_MISBEHAVING_BANTIME` (24h).

## 3. The code

### Files

```
src/net.h                     CNode, connection model, thread declarations
src/net.cpp                   ~2400 lines; the socket and message plumbing
src/netbase.cpp               CNetAddr/CService, family handling, name resolution
src/addrman.{h,cpp}           known-peer database (tried/new tables)
src/addrdb.{h,cpp}            peers.dat persistence
src/protocol.{h,cpp}          NetMsgType:: command-name constants
src/main.cpp                  ProcessMessage(...) and SendMessages(...)
src/bloom.{h,cpp}             bloom filter for filterload / merkleblock
src/sync.{h,cpp}              cs_main, cs_vNodes, LOCK macros
src/torcontrol.{h,cpp}        optional Tor v3 hidden service support
```

`CNode` is the unit of connection state:

```cpp reference title="src/net.h (class CNode)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/net.h#L262-L360
```

### Connection model

```cpp reference title="src/net.cpp (StartNode: thread creation)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/net.cpp#L1903-L2000
```

A live node has up to 125 peers, split inbound vs outbound. Outbound
peers are tracked separately for fork detection and ban management.

Globals:

- `std::vector<CNode*> vNodes` (guarded by `cs_vNodes`).
- `CAddrMan addrman` (guarded internally; persisted to `peers.dat`).
- The "Banman" equivalent here is the simpler `mapBanned` (older than
  the Bitcoin Core `BanMan` class refactor).

Threads (started in `StartNode`):

| Thread | Function | Role |
|--------|----------|------|
| `ThreadSocketHandler` | poll sockets, read/write buffers | the actual select/poll loop |
| `ThreadMessageHandler` | call `ProcessMessages` and `SendMessages` per peer | heartbeat of P2P |
| `ThreadOpenConnections` | maintain outbound peer count via `OpenNetworkConnection` | dial out |
| `ThreadOpenAddedConnections` | manage `-addnode=` static peers | manual peers |
| `ThreadDNSAddressSeed` | bootstrap from DNS seeds when addrman is empty | first-run only |
| `ThreadMapPort` | UPnP NAT traversal (optional) | NAT |
| `ThreadImport` | replay block files on startup, reindex if requested | startup only |

Reading `StartNode` in `src/net.cpp` is the fastest way to internalise
the thread map.

### Message format

The Bitcoin frame:

```
| magic (4) | command (12) | length (4) | checksum (4) | payload (length) |
```

`magic` distinguishes mainnet/testnet/regtest; defined per network in
`src/chainparams.cpp`. `command` is a NUL-padded ASCII string; the
constants live in `src/protocol.h::NetMsgType`. `checksum` is the
first four bytes of `SHA-256(SHA-256(payload))`.

Important commands, in roughly the order they fire on a new connection:

```
version, verack          handshake
addrv2, addr             gossip of peer addresses
ping, pong               keepalive
getaddr                  ask for known peers
inv, getdata             advertise / request a block or tx by hash
tx                       a transaction
block                    a block
getheaders, headers      header-first sync
getblocks                fallback block sync (legacy)
mempool                  request all txids in peer's mempool
filterload/clear/add     SPV bloom filter setup
merkleblock              SPV partial Merkle block
notfound                 negative response to getdata
reject                   why a message was rejected (deprecated in BC; still here)
```

zcashd does NOT implement BIP 152 (compact blocks), BIP 157 (compact
filters), nor BIP 339 (`wtxidrelay`). Block propagation uses `inv`
and `getdata` with full blocks.

### Handshake

```cpp reference title="src/protocol.h (CMessageHeader and inventory types)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/protocol.h#L27-L210
```

Read `ProcessMessage` (case `NetMsgType::VERSION`) and `SendMessages`
in
[src/main.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/main.cpp)
for the new-connection path.

1. Outbound side sends `version` with its `nVersion`, services,
   current block height, subversion (`"/MagicBean:5.x.x/"`), and
   address pair.
2. Inbound side replies with its own `version`.
3. Both sides send `verack`.
4. From this point both sides may send `addr`/`getaddr`,
   `getheaders`/`sendheaders`, and start synchronising blocks.

`nVersion` checks gate which messages each peer understands. The
minimum peer version is bumped each time a network upgrade activates
so that post-NU peers will not waste time talking to
clearly-incompatible peers.

### Address relay (ZIP-155 / addrv2)

zcashd supports `addrv2` (BIP 155 / partly ZIP-155) for Tor v3, I2P,
CJDNS addresses. The legacy `addr` message only carries IPv4/IPv6.
See:

```
MAX_ADDR_TO_SEND = 1000
MAX_ADDR_RATE_PER_SECOND = 0.1   (10 addresses/second sustained)
MAX_ADDR_PROCESSING_TOKEN_BUCKET = MAX_ADDR_TO_SEND
```

The rate limit prevents address-relay flooding.

### Inv / getdata flow

Transaction propagation:

1. Node A accepts a new tx into its mempool.
2. Node A sends `inv` with the txid to every other peer that does
   not already have it (tracked in `CNode::filterInventoryKnown`, a
   bloom filter).
3. Each peer that wants the tx sends `getdata`.
4. Node A sends `tx`.

Block propagation:

1. Node A connects a new block to its tip.
2. Node A sends `headers` to peers that previously sent
   `sendheaders` (headers-first peers), and `inv(MSG_BLOCK)` to the
   rest.
3. Peers request `getdata(MSG_BLOCK)` and receive the full block.

There is no compact-block path. Block propagation is the largest
single bandwidth cost on the network.

### Block download and headers-first sync

When a peer announces a longer header chain, zcashd downloads
headers first via `getheaders` (up to 2000 per response). Once the
header chain is constructed in memory (`mapBlockIndex`), the node
downloads blocks out of order from multiple peers in parallel
(`MAX_BLOCKS_IN_TRANSIT_PER_PEER`) and connects them in chain order.
See `src/main.cpp::FindNextBlocksToDownload` and the
`MarkBlockAsReceived`/`MarkBlockAsInFlight` machinery.

### Mempool propagation

```cpp reference title="src/txmempool.h (CTxMemPool interface)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/txmempool.h#L1-L80
```

A new transaction enters via `AcceptToMemoryPool` in
[src/main.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/main.cpp),
called from `ProcessMessage` (`case TX`) and from
`sendrawtransaction`. The acceptance pipeline is approximately:

```
CheckTransaction                      # noncontextual
ContextualCheckTransaction(...)       # height = chainActive.Height() + 1
IsStandardTx(...)                     # mempool policy (not consensus)
CheckInputs(...)                      # double-spend, script verification
CheckShieldedRequirements(...)        # nullifiers, anchors
ProofVerifier::Validate(...)          # zk-SNARK / Halo 2 verification
addUnchecked(...)                     # insert into the mempool data structure
```

Mempool limits are enforced by `src/mempool_limit.cpp` (a weighted
cost bound, not a simple count). The mempool eviction policy treats
shielded transactions as more expensive than transparent ones because
their validation cost is higher.

`CTxMemPool::infoAll()` and the `getrawmempool` RPC are the easiest
ways to inspect mempool state during development.

### Misbehaviour and bans

`Misbehaving(nodeId, dosScore)` adds to a peer's misbehaviour score.
Above `BANSCORE_THRESHOLD` the peer is banned for
`DEFAULT_MISBEHAVING_BANTIME` (24h). Many `Misbehaving` calls are
scattered through `ProcessMessage` and `main.cpp` for specific
malformed inputs.

There is no IP-based DoS prevention beyond ban and disconnect. If
floods need to be handled, the OS firewall or `-whitelist=` is the
mechanism.

### Privacy

zcashd does not advertise IP via `addr` if connected over Tor.
`-onlynet=onion` restricts to Tor; `-listenonion=1` runs a hidden
service. `-bind=`/`-externalip=` control what addresses are
advertised.

The transaction-origin privacy story is weak: zcashd does no
Dandelion++, no MIX-based broadcast, and does not delay inv
announcements (Bitcoin Core does both since 0.21 / Erlay-related
work). A privacy-conscious user is expected to use Tor for sending.

### Bandwidth and storage tuning

Operational knobs explained to operators:

- `-maxconnections=N` (default 125): cap on simultaneous peers.
- `-maxuploadtarget=N` (MiB/24h): cap upstream bandwidth; oldest
  blocks not served once exceeded.
- `-prune=N`: prune blockfiles below N MiB. Disables `-rescan`.
- `-dbcache=N` (MiB): UTXO cache size. Largest single perf knob.
- `-par=N`: script-verification worker threads.

### Where the Bitcoin Core delta hurts

Several Bitcoin Core security improvements made after the 0.12 fork
have not been ported. Be aware:

- Compact block relay (BIP 152) would significantly reduce
  bandwidth.
- BIP 339 wtxid relay would avoid double-fetching segwit transactions
  (less relevant here without segwit).
- The `BlockManager` separation of `validation.cpp` and
  `net_processing.cpp` would clean up the entanglement between
  `main.cpp` and the P2P layer.
- The eviction policy for inbound peers in Bitcoin Core is more
  nuanced than zcashd's "kick the least useful".
- The `addrman` deserialisation has had hardening since 0.12 that
  may or may not have been backported.

ZODL will eventually want to port some of these or write
replacements. None is consensus-critical, but all are operationally
important. Survey the current Bitcoin Core `src/net_processing.cpp`
before starting any refactor.

## 4. Failure modes

- **Holding `cs_main` for too long during message processing.**
  Stalls the entire validation pipeline; long messages produce peer
  timeouts. Caught by: subjective bench testing and (sometimes)
  flaky RPC tests.
- **Forgetting to set `Misbehaving` on a malformed message.** The
  peer continues to consume resources. Caught by: code review,
  occasionally `src/test/DoS_tests.cpp`.
- **Reading wire bytes directly without going through
  `serialize.h`.** Breaks endianness or size handling. Caught by:
  cross-peer connection tests.
- **Treating addrv2 as universal.** Old peers will not understand
  it; the send code must check `nVersion`. Caught by: peer
  interoperability tests.
- **No Dandelion++ means leaking tx origin.** Operator-facing
  problem, not a regression in the protocol layer.

## 5. Spec pointers

- [Bitcoin reference: P2P network](https://developer.bitcoin.org/reference/p2p_networking.html):
  the upstream of most messages here.
- [BIP 155 (addrv2)](https://github.com/bitcoin/bips/blob/master/bip-0155.mediawiki).
- [ZIP-201](https://zips.z.cash/zip-0201): network peer management
  for nodes.

## 6. Exercises

1. **Trace a handshake.** Run `zcashd -debug=net` against a single
   regtest peer and pull the version/verack exchange out of
   `debug.log`. Match each line to a `ProcessMessage` case in
   `src/main.cpp`.

2. **Identify a missing BIP.** Read Bitcoin Core's
   `src/net_processing.cpp` around `cmpctblock` handling and confirm
   that zcashd has no equivalent. Why is this less of a problem on
   the Zcash chain than on Bitcoin? Hint: block-time spacing and
   block-size differences.

3. **Modification exercise.** Add a `-debug=netbw` flag that prints
   bytes-per-peer-per-minute every 60 seconds. Verify with two
   regtest peers and assorted load.

4. **Discover an addrman quirk.** Read
   [src/addrman.{h,cpp}](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/addrman.h)
   and identify how it prevents bucket flooding by a single source
   IP. (Answer: the source IP is part of the bucket-key hash.)

## 7. Further reading

- Pieter Wuille's
  [addrman gist](https://gist.github.com/sipa/d7dcaae0419f10e5be0270fada84c20b)
  on the threat model behind the new/tried table design.
- Bitcoin Core's
  [doc/p2p-overview.md](https://github.com/bitcoin/bitcoin/blob/master/doc/p2p-overview.md).
- [BIP 339](https://github.com/bitcoin/bips/blob/master/bip-0339.mediawiki)
  on wtxid relay.
