# 05 - P2P networking

The peer-to-peer layer is almost unchanged from Bitcoin Core 0.12. Same
message names, same handshake, same `addr`/`getaddr` discovery, same
INV-based block and transaction propagation. The Zcash modifications are
limited to the version-handshake parameters (a different protocol version,
a Zcash subversion), new service flags, and Zcash-specific message handling
for shielded transaction sizes.

If you have read the Bitcoin P2P docs (https://developer.bitcoin.org/reference/p2p_networking.html)
once, you already know 90% of what is here.

## Files to read

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

## Connection model

`CNode` (in `src/net.h:262`) is one TCP connection. A live node has up to
`DEFAULT_MAX_PEER_CONNECTIONS = 125` of them, split into inbound (accepted)
and outbound (initiated). Outbound peers are tracked separately for fork
detection and ban management.

Globals:

- `std::vector<CNode*> vNodes` (guarded by `cs_vNodes`).
- `CAddrMan addrman` (guarded internally; persisted to `peers.dat`).
- The "Banman" equivalent here is the simpler `mapBanned` (this is older
  than the Bitcoin Core `BanMan` class refactor).

Threads (started in `StartNode`):

| Thread | Function | Role |
|--------|----------|------|
| `ThreadSocketHandler` | poll sockets, read into per-`CNode` receive buffer, write from send buffer | the actual select/poll loop |
| `ThreadMessageHandler` | call `ProcessMessages` and `SendMessages` for each peer | the heartbeat of P2P |
| `ThreadOpenConnections` | drive `OpenNetworkConnection` to maintain outbound peer count | dial out |
| `ThreadOpenAddedConnections` | manage `-addnode=` static peers | manual peers |
| `ThreadDNSAddressSeed` | bootstrap from DNS seeds when addrman is empty | first-run only |
| `ThreadMapPort` | UPnP NAT traversal (optional) | NAT |
| `ThreadImport` | replay block files on startup, reindex if requested | startup only |

Reading `StartNode` in `src/net.cpp` is the fastest way to internalise the
thread map.

## Message format

The Bitcoin message frame:

```
| magic (4) | command (12) | length (4) | checksum (4) | payload (length) |
```

`magic` distinguishes mainnet / testnet / regtest; defined per network in
`src/chainparams.cpp`. `command` is a NUL-padded ASCII string; the
constants are in `src/protocol.h::NetMsgType`. `checksum` is the first
four bytes of `SHA-256(SHA-256(payload))`.

Important commands (in roughly the order they fire on a new connection):

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
reject                   why a message was rejected (deprecated in Bitcoin Core; still here)
```

zcashd does not implement BIP 152 (compact blocks), BIP 157 (compact
filters), nor BIP 339 (`wtxidrelay`). Block propagation uses `inv` and
`getdata` with full blocks.

## Handshake

Read `ProcessMessage` (case `NetMsgType::VERSION`) and `SendMessages` for
the new-connection path.

1. Outbound side sends `version` with its `nVersion`, services, current
   block height, subversion (`"/MagicBean:5.x.x/"`), and address pair.
2. Inbound side replies with its own `version`.
3. Both sides send `verack`.
4. From this point both sides may send `addr`/`getaddr`,
   `getheaders`/`sendheaders`, and start synchronising blocks.

`nVersion` checks gate which messages each peer understands. The minimum
peer version is bumped each time a network upgrade activates so that
post-NU peers will not waste time talking to clearly-incompatible peers.

## Address management

`CAddrMan` (`src/addrman.h`) is the same code as Bitcoin Core's classic
address manager. It maintains two tables:

- **New table**: addresses learned via `addr` from peers we have not
  successfully connected to.
- **Tried table**: addresses we have successfully connected to at least
  once.

Each table is a fixed-size set of buckets keyed by a hash of the address,
the source, and a random salt (`nKey`). The randomisation makes it hard
for an attacker to populate buckets deterministically. Eviction is
deterministic given the salt.

Read ZIP-200 era discussions and `https://gist.github.com/sipa/d7dcaae0419f10e5be0270fada84c20b`
for the threat model.

Addresses are persisted to `peers.dat` by `CAddrDB` and reloaded at
startup.

## Address relay (ZIP-155 / addrv2)

zcashd supports `addrv2` (BIP 155 / partly ZIP-155) for Tor v3, I2P, CJDNS
addresses. The legacy `addr` message only carries IPv4/IPv6. See:

```
MAX_ADDR_TO_SEND = 1000
MAX_ADDR_RATE_PER_SECOND = 0.1   (10 addresses/second sustained)
MAX_ADDR_PROCESSING_TOKEN_BUCKET = MAX_ADDR_TO_SEND
```

The rate limit is to prevent address-relay flooding.

## Inv / getdata flow

Transaction propagation:

1. Node A accepts a new tx into its mempool.
2. Node A sends `inv` with the txid to every other peer that does not
   already have it (tracked in `CNode::filterInventoryKnown`, a bloom
   filter).
3. Each peer that wants the tx sends `getdata`.
4. Node A sends `tx`.

Block propagation:

1. Node A connects a new block to its tip.
2. Node A sends `headers` to peers that previously sent `sendheaders`
   (headers-first peers), and `inv(MSG_BLOCK)` to the rest.
3. Peers request `getdata(MSG_BLOCK)` and receive the full block.

There is no compact-block path. Block propagation is the largest single
bandwidth cost on the network.

## Block download and headers-first sync

When a peer announces a longer header chain, zcashd downloads headers
first via `getheaders` (up to 2000 per response). Once the header chain
is constructed in memory (`mapBlockIndex`), the node downloads blocks
out of order from multiple peers in parallel (`MAX_BLOCKS_IN_TRANSIT_PER_PEER`)
and connects them in chain order. See `src/main.cpp::FindNextBlocksToDownload`
and the `MarkBlockAsReceived`/`MarkBlockAsInFlight` machinery.

## Mempool propagation

A new transaction enters via `AcceptToMemoryPool` (`src/main.cpp`),
called from `ProcessMessage` (`case TX`) and from `sendrawtransaction`.
The acceptance pipeline is approximately:

```
CheckTransaction                      # noncontextual
ContextualCheckTransaction(...)       # height = chainActive.Height() + 1
IsStandardTx(...)                     # mempool policy (not consensus)
CheckInputs(...)                      # double-spend, script verification
CheckShieldedRequirements(...)        # nullifiers, anchors
ProofVerifier::Validate(...)          # zk-SNARK / Halo 2 verification
addUnchecked(...)                     # insert into the mempool data structure
```

Mempool limits are enforced by `src/mempool_limit.cpp` (a weighted cost
bound, not a simple count). The mempool eviction policy treats shielded
transactions as more expensive than transparent ones because their
validation cost is higher.

`CTxMemPool::infoAll()` and the `getrawmempool` RPC are the easiest ways
to inspect mempool state during development.

## Misbehaviour and bans

`Misbehaving(nodeId, dosScore)` adds to a peer's misbehaviour score.
Above `BANSCORE_THRESHOLD` the peer is banned for `DEFAULT_MISBEHAVING_BANTIME`
(24 hours). Many `Misbehaving` calls are scattered through `ProcessMessage`
and `main.cpp` for specific malformed inputs.

There is no IP-based DoS prevention beyond ban and disconnect; if you need
to handle a flood, you handle it at the OS firewall or with `-whitelist=`.

## Privacy

zcashd does not advertise IP via `addr` if connected over Tor.
`-onlynet=onion` restricts to Tor; `-listenonion=1` runs a hidden service.
`-bind=`/`-externalip=` control what addresses are advertised.

The transaction-origin privacy story is weak: zcashd does no Dandelion++,
no MIX-based broadcast, and does not delay inv announcements (Bitcoin Core
does both since 0.21 / Erlay-related work). A privacy-conscious user is
expected to use Tor for sending.

## Bandwidth and storage tuning

Operational knobs you will explain to operators:

- `-maxconnections=N` (default 125): cap on simultaneous peers.
- `-maxuploadtarget=N` (MiB/24h): cap upstream bandwidth; oldest blocks
  not served once exceeded.
- `-prune=N`: prune blockfiles below N MiB. Disables `-rescan`.
- `-dbcache=N` (MiB): UTXO cache size. Largest single perf knob.
- `-par=N`: script-verification worker threads.

## Where the Bitcoin Core delta hurts

Several Bitcoin Core security improvements made after the 0.12 fork have
not been ported. Be aware:

- Compact block relay (BIP 152) would significantly reduce bandwidth.
- BIP 339 wtxid relay would avoid double-fetching segwit txes (less
  relevant here without segwit).
- The `BlockManager` separation of `validation.cpp` and `net_processing.cpp`
  would clean up the entanglement between `main.cpp` and the P2P layer.
- The eviction policy for inbound peers in Bitcoin Core is more nuanced
  than zcashd's "kick the least useful".
- The `addrman` deserialisation has had hardening since 0.12 that may or
  may not have been backported.

ZODL will eventually want to either port some of these or write
replacements. None of them is consensus-critical, but all are
operationally important. Survey the current Bitcoin Core
`src/net_processing.cpp` before starting any refactor.

## Test entry points

- Unit tests: `src/test/net_tests.cpp`, `src/test/addrman_tests.cpp`,
  `src/test/netbase_tests.cpp`, `src/test/DoS_tests.cpp`.
- RPC tests: `qa/rpc-tests/nodehandling.py`,
  `qa/rpc-tests/maxblocksinflight.py`, `qa/rpc-tests/maxuploadtarget.py`,
  `qa/rpc-tests/p2p-acceptblock.py`, `qa/rpc-tests/p2p-fullblocktest.py`.

When debugging peer issues, the most useful tools are `getpeerinfo` over
RPC, `-debug=net`, and `tcpdump` against the peer port.
