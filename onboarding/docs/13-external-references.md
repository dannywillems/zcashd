---
sidebar_position: 13
title: "External references"
description: "ZIPs, the Zcash Protocol Specification, papers, related repositories, and where to file security disclosures."
---

# External references

## 1. Why this chapter exists

The single most important fact about this codebase is that it does
not contain the protocol. The protocol lives in the Zcash Protocol
Specification and in the ZIPs. zcashd is one implementation. Always
cross-check the code against the spec.

This chapter is the index of external authorities. It is intentionally
flat: a reader does not study it linearly; the reader returns to it
when chasing a citation.

## 2. Definitions

**Definition 12.1 (Protocol specification).** The
[Zcash Protocol Specification](https://zips.z.cash/protocol/protocol.pdf)
PDF is the normative description of consensus. Section numbers are
stable across revisions. Source LaTeX lives in
[github.com/zcash/zips/tree/main/protocol](https://github.com/zcash/zips/tree/main/protocol).

**Definition 12.2 (ZIP).** A Zcash Improvement Proposal. Indexed at
[zips.z.cash](https://zips.z.cash/). Each is a numbered document
describing one protocol-level decision.

## 3. The references

### The spec

- [Zcash Protocol Specification, NU5 edition](https://zips.z.cash/protocol/protocol.pdf).
- [Source LaTeX of the spec](https://github.com/zcash/zips/tree/main/protocol).
- Errata: the spec is versioned; check the latest revision when in
  doubt.

Every consensus rule in
[src/main.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/main.cpp)
corresponds to a paragraph in the spec.

### ZIPs

- Repository: [github.com/zcash/zips](https://github.com/zcash/zips).
- Browseable index: [zips.z.cash](https://zips.z.cash/).
- Mailing list (historical): [lists.zfnd.org](https://lists.zfnd.org/).

The ZIPs that have shaped zcashd, by area:

#### Consensus and transaction format

- [ZIP-32](https://zips.z.cash/zip-0032): hierarchical deterministic
  shielded keys.
- [ZIP-143](https://zips.z.cash/zip-0143): Overwinter sighash.
- [ZIP-200](https://zips.z.cash/zip-0200),
  [ZIP-201](https://zips.z.cash/zip-0201),
  [ZIP-202](https://zips.z.cash/zip-0202): network upgrades, version
  groups, ascending tx versions.
- [ZIP-203](https://zips.z.cash/zip-0203): transaction expiry.
- [ZIP-205](https://zips.z.cash/zip-0205),
  [ZIP-206](https://zips.z.cash/zip-0206): pool-specific dust
  thresholds.
- [ZIP-209](https://zips.z.cash/zip-0209): turnstile enforcement.
- [ZIP-212](https://zips.z.cash/zip-0212): enforce Sapling note
  plaintext consistency.
- [ZIP-213](https://zips.z.cash/zip-0213): shielded coinbase.
- [ZIP-215](https://zips.z.cash/zip-0215): Ed25519 verification.
- [ZIP-216](https://zips.z.cash/zip-0216): canonical Jubjub encodings.
- [ZIP-221](https://zips.z.cash/zip-0221): history MMR (Heartwood).
- [ZIP-222](https://zips.z.cash/zip-0222): replay protection on
  transparent.
- [ZIP-225](https://zips.z.cash/zip-0225): v5 transaction format.
- [ZIP-243](https://zips.z.cash/zip-0243): Sapling sighash.
- [ZIP-244](https://zips.z.cash/zip-0244): NU5 transaction digests
  and sighash.
- [ZIP-252](https://zips.z.cash/zip-0252): NU5 deployment.

#### Funding streams and economics

- [ZIP-207](https://zips.z.cash/zip-0207): funding streams.
- [ZIP-208](https://zips.z.cash/zip-0208): Blossom block-target
  adjustment.
- [ZIP-214](https://zips.z.cash/zip-0214): post-Canopy funding-stream
  addresses.

#### Addresses and wallet

- [ZIP-301](https://zips.z.cash/zip-0301): stratum mining protocol.
- [ZIP-307](https://zips.z.cash/zip-0307): light client protocol.
- [ZIP-308](https://zips.z.cash/zip-0308): payment disclosure.
- [ZIP-316](https://zips.z.cash/zip-0316): unified addresses, unified
  viewing keys.
- [ZIP-317](https://zips.z.cash/zip-0317): revised fee policy.
- [ZIP-321](https://zips.z.cash/zip-0321): payment URI.
- [ZIP-339](https://zips.z.cash/zip-0339): BIP-39 wordlist
  standardisation.

#### Orchard, Halo 2, and post-NU5

- [ZIP-224](https://zips.z.cash/zip-0224): Orchard Action description.
- [ZIP-226](https://zips.z.cash/zip-0226) (in flux): ZSAs (Zcash
  Shielded Assets).
- [ZIP-227](https://zips.z.cash/zip-0227),
  [ZIP-228](https://zips.z.cash/zip-0228): ZSAs continued.

When code says `// ZIP-N`, open the ZIP. The ZIP says *why* the
code does what it does.

### Related repositories

#### Zcash Foundation

- [zebra](https://github.com/ZcashFoundation/zebra): the Rust full
  node.
- [frost](https://github.com/ZcashFoundation/frost): Schnorr threshold
  signatures used in some wallet work.
- [Other wallet projects](https://github.com/ZcashFoundation).

#### Electric Coin Company / librustzcash ecosystem

- [librustzcash](https://github.com/zcash/librustzcash): the canonical
  Rust crate workspace.
- [orchard](https://github.com/zcash/orchard): Halo 2 Orchard
  implementation.
- [halo2](https://github.com/zcash/halo2): the Halo 2 proof system.
- [zcash-grants](https://github.com/zcash-grants) and
  [zcash-hackworks](https://github.com/zcash-hackworks): historical
  tooling and MPC artifacts.
- [pasta_curves](https://github.com/zcash/pasta_curves): the Pasta
  cycle of curves used by Orchard.
- [incrementalmerkletree](https://github.com/zcash/incrementalmerkletree):
  the IMT crate used by Sapling and Orchard.

#### Mobile and light clients

- [zcash-android-wallet-sdk](https://github.com/Electric-Coin-Company/zcash-android-wallet-sdk),
  [zcash-swift-wallet-sdk](https://github.com/Electric-Coin-Company/zcash-swift-wallet-sdk),
  [zashi-ios](https://github.com/Electric-Coin-Company/zashi-ios),
  [zashi-android](https://github.com/Electric-Coin-Company/zashi-android).

#### Block explorers and tooling

- ZcashBlockExplorer (various community forks).
- zecpages, zecmate (community tooling).

### Books and longer reads

- [The Zerocash paper](https://eprint.iacr.org/2014/349)
  (Sasson et al., 2014): the original construction underlying
  Sprout.
- "Sapling: A Privacy-Preserving Cryptocurrency for the Decentralized
  Web" (Bowe-Hopwood et al.). Background reading for Sapling.
- "Halo: Recursive Proof Composition without a Trusted Setup" (Bowe,
  Grigg, Hopwood, 2019). The basis of Halo 2.
- [Halo 2 book](https://zcash.github.io/halo2/).
- [Orchard book](https://zcash.github.io/orchard/).
- [Zcash User Guide](https://zcash.readthedocs.io/).
- "Mastering Bitcoin" (Antonopoulos): the Bitcoin Core background
  zcashd inherits.

### Papers worth knowing about

- Equihash: Biryukov, Khovratovich, "Equihash: Asymmetric
  Proof-of-Work Based on the Generalized Birthday Problem",
  NDSS 2016.
- BLAKE2: Aumasson, Neves, Wilcox-O'Hearn, Winnerlein, 2013.
- Pinocchio (PGHR13): the original quadratic-arithmetic-program SNARK
  used by Sprout.
- Groth16: Jens Groth, "On the Size of Pairing-Based Non-interactive
  Arguments", EUROCRYPT 2016. Used by Sapling.
- BLS12-381: the curve used by Sapling; see the spec and the
  "BLS12-381 for the rest of us" blog post.
- Pasta curves: defined by Daira-Emma Hopwood; see the
  [pasta_curves](https://github.com/zcash/pasta_curves) repo.
- Sinsemilla: defined in the Orchard spec.

### Communities and forums

- [Zcash community forum](https://forum.z.cash/).
- [Discord](https://discordapp.com/invite/PhJY6Pm).
- Zcash community calls (Arborist meetings, R&D calls): announced
  on the forum and on Twitter.
- IETF / academic venues: papers from ECC researchers and Foundation
  researchers tend to appear at EUROCRYPT, CRYPTO, S&P, CCS, and on
  [ePrint](https://eprint.iacr.org/).

### Issue trackers

- [zcashd issues](https://github.com/zcash/zcash/issues).
- [zebra issues](https://github.com/ZcashFoundation/zebra/issues).
- [librustzcash issues](https://github.com/zcash/librustzcash/issues).
- [orchard issues](https://github.com/zcash/orchard/issues).
- [ZIPs issues](https://github.com/zcash/zips/issues).
- [halo2 issues](https://github.com/zcash/halo2/issues).

When triaging a bug report, check whether the underlying issue is in
zcashd, librustzcash, or further upstream. Most cryptographic bugs
are upstream.

### Disclosure

- `security@z.cash` is the disclosure address.
- The PGP key is in
  [SECURITY.md](https://github.com/zcash/zcash/blob/v5.5.0-rc1/SECURITY.md).
- Disclosure policy:
  [RD-Crypto-Spec/Responsible-Disclosure](https://github.com/RD-Crypto-Spec/Responsible-Disclosure)
  with Zcash-specific deviations described in `SECURITY.md` (because
  of counterfeiting-bug subtleties).
- Bilateral disclosure relationships exist with Zcash Foundation
  (zebra), Horizen, Komodo, Bitcoin ABC. ZODL will inherit these
  relationships.

### Conventions for citing in commits and PRs

Reference ZIPs by number (`ZIP-244`), spec sections by chapter
(`Spec section 6.3.2`), and Bitcoin BIPs by number (`BIP-32`). Link
to GitHub permalinks for code references; link to
[zips.z.cash/protocol/protocol.pdf](https://zips.z.cash/protocol/protocol.pdf)
for the spec.

For commit messages, follow the repository's existing style (see
`git log` for examples; small subject line under 80 columns, body
that explains *why* and links to the ZIP / issue / PR).

### Quick lookup map

| Question | First place to look |
|----------|---------------------|
| What is the activation height for X on mainnet? | [src/chainparams.cpp::CMainParams](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/chainparams.cpp) |
| What is the consensus rule for X? | the spec, then [src/main.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/main.cpp) |
| What does this BLAKE2 personalisation mean? | `zcash_primitives::constants` upstream, and the spec |
| Is this an RPC or a wallet RPC? | grep for the command name in [src/rpc/](https://github.com/zcash/zcash/tree/v5.5.0-rc1/src/rpc) and [src/wallet/rpcwallet.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/wallet/rpcwallet.cpp) |
| What does this Rust function do on the C++ side? | grep for `librustzcash_<name>` in `src/` and check [src/rust/include/rust/](https://github.com/zcash/zcash/tree/v5.5.0-rc1/src/rust/include/rust) |
| Where does Sapling proof verification happen? | [src/rust/src/sapling.rs](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/sapling.rs) (batch) and `zcash_proofs::sapling` upstream |
| Why was this changed? | `git log -p <file>` and any linked PR / issue |
| What is the on-disk format of...? | the relevant `serialize.h`/`Serialize` overload, plus [src/dbwrapper.{h,cpp}](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/dbwrapper.h) for LevelDB key shape |

## 4. Failure modes

- **Citing a ZIP without reading it.** ZIPs are short; read the
  one being cited. Misciting a ZIP in a PR description sends
  reviewers in the wrong direction.
- **Citing the spec without giving a section number.** "The spec
  says" is unfalsifiable; "Spec section 4.7.3" is checkable.
- **Linking to a moving branch (`main`).** Use a tag (e.g.
  `v5.5.0-rc1`) or a commit SHA. This course pins to `v5.5.0-rc1`.

## 5. Spec pointers

This chapter IS the spec-pointer reference. See section 3.

## 6. Exercises

1. **Practice the citation pattern.** Write a one-paragraph
   description of how branch IDs work, citing one ZIP and one code
   path. Compare to the discussion in
   [Chapter 04](./04-consensus.md).

2. **Find a stale link.** Browse the upstream repos linked above
   and spot any that have moved or archived. Open a PR against this
   course.

3. **Locate a paper.** Find the original BLS12-381 design document
   and explain why the curve was chosen for Sapling. Hint: the
   "BLS12-381 for the rest of us" blog post is the entry point.

## 7. Further reading

- [Daira Hopwood's blog and papers](https://github.com/daira), the
  intellectual through-line of Zcash protocol design.
- [Sean Bowe's zk crypto writeups](https://electriccoin.co/blog/),
  for Sapling / Halo / Halo 2 context.
- [Cure53's audit reports on Zcash](https://cure53.de/),
  archive of past third-party security work.
