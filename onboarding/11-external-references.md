# 11 - External references

The single most important fact about this codebase is that it does not
contain the protocol. The protocol lives in the Zcash Protocol
Specification and in the ZIPs. zcashd is one implementation. Always
cross-check the code against the spec.

## The spec

- Zcash Protocol Specification (NU5 edition):
  `https://zips.z.cash/protocol/protocol.pdf`
- Source LaTeX of the spec:
  `https://github.com/zcash/zips/tree/main/protocol`
- Errata: the spec is versioned; check the latest revision when in
  doubt.

The spec is the authoritative description of consensus. Every consensus
rule in `src/main.cpp` corresponds to a paragraph in the spec.

## ZIPs

The ZIP process:

- Repository: `https://github.com/zcash/zips`
- Browseable index: `https://zips.z.cash/`
- Mailing list (historical): `https://lists.zfnd.org/`

The ZIPs that have shaped zcashd, by area:

### Consensus and transaction format

- ZIP-32: hierarchical deterministic shielded keys.
- ZIP-143: Overwinter sighash.
- ZIP-200, 201, 202: network upgrades, version groups, ascending tx
  versions.
- ZIP-203: transaction expiry.
- ZIP-205, 206: pool-specific dust thresholds.
- ZIP-209: turnstile enforcement.
- ZIP-212: enforce Sapling note plaintext consistency.
- ZIP-213: shielded coinbase.
- ZIP-215: Ed25519 verification.
- ZIP-216: canonical Jubjub encodings.
- ZIP-221: history MMR (Heartwood).
- ZIP-222: replay protection on transparent.
- ZIP-225: v5 transaction format.
- ZIP-243: Sapling sighash.
- ZIP-244: NU5 transaction digests and sighash.
- ZIP-252: NU5 deployment.

### Funding streams and economics

- ZIP-207: funding streams.
- ZIP-208: Blossom block-target adjustment.
- ZIP-214: post-Canopy funding-stream addresses.

### Addresses and wallet

- ZIP-301: stratum mining protocol.
- ZIP-307: light client protocol.
- ZIP-308: payment disclosure.
- ZIP-316: unified addresses, unified viewing keys.
- ZIP-317: revised fee policy.
- ZIP-321: payment URI.
- ZIP-339: BIP-39 wordlist standardisation.

### Orchard, Halo 2, and post-NU5

- ZIP-224: Orchard Action description.
- ZIP-226 (in flux): ZSAs (Zcash Shielded Assets).
- ZIP-227, 228: ZSAs continued.

When you read code that says `// ZIP-N`, open the ZIP. The ZIP says
*why* the code does what it does.

## Related repositories

### Zcash Foundation

- `zebra` (the Rust full node):
  `https://github.com/ZcashFoundation/zebra`
- `frost` (Schnorr threshold signatures used in some wallet work):
  `https://github.com/ZcashFoundation/frost`
- Wallet projects: `https://github.com/ZcashFoundation`

### Electric Coin Company / librustzcash ecosystem

- `librustzcash` (the canonical Rust crate workspace):
  `https://github.com/zcash/librustzcash`
- `orchard` (Halo 2 Orchard implementation):
  `https://github.com/zcash/orchard`
- `halo2` (the Halo 2 proof system):
  `https://github.com/zcash/halo2`
- `zcash-grants` and `zcash-hackworks/*` (historical tooling and MPC
  artifacts).
- `pasta_curves` (the Pasta cycle of curves used by Orchard):
  `https://github.com/zcash/pasta_curves`
- `incrementalmerkletree`:
  `https://github.com/zcash/incrementalmerkletree`

### Mobile and light clients

- `zcash-android-wallet-sdk`, `zcash-swift-wallet-sdk`,
  `zashi-ios`, `zashi-android` (under ECC and partner orgs).

### Block explorers and tooling

- ZcashBlockExplorer (various community forks).
- `zecpages`, `zecmate` (community tooling).

## Books and longer reads

- The Zerocash paper (Sasson et al., 2014): the original construction
  underlying Sprout.
- The "Sapling: A Privacy-Preserving Cryptocurrency for the Decentralized Web"
  paper (Bowe-Hopwood et al.). Background reading for Sapling.
- "Halo: Recursive Proof Composition without a Trusted Setup" (Bowe,
  Grigg, Hopwood, 2019). The basis of Halo 2.
- Halo 2 book: `https://zcash.github.io/halo2/`.
- Orchard book: `https://zcash.github.io/orchard/`.
- The Zcash User Guide: `https://zcash.readthedocs.io/`.
- "Mastering Bitcoin" (Antonopoulos): for the Bitcoin Core background
  that zcashd inherits.

## Papers worth knowing about

- Equihash: Biryukov, Khovratovich, "Equihash: Asymmetric Proof-of-Work
  Based on the Generalized Birthday Problem", NDSS 2016.
- BLAKE2: Aumasson, Neves, Wilcox-O'Hearn, Winnerlein, 2013.
- Pinocchio (PGHR13): the original quadratic-arithmetic-program SNARK
  used by Sprout.
- Groth16: Jens Groth, "On the Size of Pairing-Based Non-interactive
  Arguments", EUROCRYPT 2016. Used by Sapling.
- BLS12-381: the curve used by Sapling; not a paper per se; see the
  spec and the "BLS12-381 for the rest of us" blog post.
- Pasta curves: defined by Daira-Emma Hopwood; see the `pasta_curves`
  repo.
- Sinsemilla: defined in the Orchard spec.

## Communities and forums

- Zcash community forum: `https://forum.z.cash/`
- Discord: `https://discordapp.com/invite/PhJY6Pm`
- Zcash community calls (Arborist meetings, R&D calls): announced on
  the forum and on Twitter.
- IETF / academic venues: papers from ECC researchers and Foundation
  researchers tend to appear at EUROCRYPT, CRYPTO, S&P, CCS, and on
  ePrint (`https://eprint.iacr.org/`).

## Issue trackers

- zcashd issues:
  `https://github.com/zcash/zcash/issues`
- zebra issues:
  `https://github.com/ZcashFoundation/zebra/issues`
- librustzcash issues:
  `https://github.com/zcash/librustzcash/issues`
- orchard issues:
  `https://github.com/zcash/orchard/issues`
- ZIPs:
  `https://github.com/zcash/zips/issues`
- halo2:
  `https://github.com/zcash/halo2/issues`

When triaging a bug report, check whether the underlying issue is in
zcashd, librustzcash, or further upstream. Most cryptographic bugs are
upstream.

## Disclosure

- `security@z.cash` is the disclosure address.
- The PGP key is in `SECURITY.md`.
- Disclosure policy:
  `https://github.com/RD-Crypto-Spec/Responsible-Disclosure`
  with Zcash-specific deviations described in `SECURITY.md` (because
  of counterfeiting-bug subtleties).
- Bilateral disclosure relationships exist with Zcash Foundation
  (zebra), Horizen, Komodo, Bitcoin ABC. ZODL will inherit these
  relationships.

## Conventions for citing in commits and PRs

Reference ZIPs by number (`ZIP-244`), spec sections by chapter
(`Spec section 6.3.2`), and Bitcoin BIPs by number (`BIP-32`). Link to
GitHub permalinks for code references; link to
`https://zips.z.cash/protocol/protocol.pdf` for the spec.

For commit messages, follow the repository's existing style (see
`git log` for examples; small subject line under 80 columns, body
that explains *why* and links to the ZIP / issue / PR).

## Quick lookup map (where do I look for...)

| Question | First place to look |
|----------|---------------------|
| What is the activation height for X on mainnet? | `src/chainparams.cpp::CMainParams` |
| What is the consensus rule for X? | the spec, then `src/main.cpp` |
| What does this BLAKE2 personalisation mean? | `zcash_primitives::constants` and the spec |
| Is this an RPC or a wallet RPC? | grep for the command name in `src/rpc/` and `src/wallet/rpcwallet.cpp` |
| What does this Rust function do on the C++ side? | grep for `librustzcash_<name>` in `src/` and check `src/rust/include/rust/*.h` |
| Where does Sapling proof verification happen? | `src/rust/src/sapling.rs` (batch) and `zcash_proofs::sapling` upstream |
| Why was this changed? | `git log -p <file>` and any linked PR / issue |
| What is the on-disk format of...? | the relevant `serialize.h`/`Serialize` overload, plus `src/dbwrapper.{h,cpp}` for LevelDB key shape |
