# Zcash (zcashd) Onboarding Course

A graduate course on the zcashd codebase, written for a principal cryptography
engineer joining ZODL.

This course is structured as a self-paced reading guide. Each chapter teaches a
specific subsystem and points to the exact files, functions, and external
documents to read. The intent is to take you from "I know cryptography but
zcashd is a 200k-line Bitcoin fork" to "I can navigate, audit, and modify any
subsystem".

## Reading order

Read in this order. Each chapter assumes the previous one.

| # | File | Topic | Estimated time |
|---|------|-------|----------------|
| 01 | `01-context-and-history.md` | What zcashd is, who maintains it, where it sits in the ecosystem | 1 hour |
| 02 | `02-build-system.md` | Autotools, depends/, zcutil/build.sh, Rust/C++ interop | 2 hours |
| 03 | `03-code-organization.md` | Tour of `src/`, file-by-file role map | 3 hours |
| 04 | `04-consensus.md` | Consensus parameters, network upgrades, validation pipeline | 4 hours |
| 05 | `05-p2p-networking.md` | Peer-to-peer protocol, message handling, peer lifecycle | 3 hours |
| 06 | `06-cryptography.md` | Hash functions, Equihash PoW, signatures, BLAKE2 personalization | 4 hours |
| 07 | `07-zk-proofs-and-pools.md` | Sprout/Sapling/Orchard, JoinSplit, Halo 2, librustzcash | 6 hours |
| 08 | `08-wallet-and-rpc.md` | Wallet design, ZIP-32, addresses, RPC, ZMQ | 3 hours |
| 09 | `09-testing.md` | gtest, RPC test framework, fuzzing | 2 hours |
| 10 | `10-reading-plan.md` | A 6-week structured study plan with exercises | reference |
| 11 | `11-external-references.md` | ZIPs, protocol spec, papers, related repos | reference |

Total active reading: roughly 30 hours. Plan to spend another 60-80 hours
running the node, instrumenting it, and writing patches against it before
considering yourself fluent.

## How to use this course

1. Read chapters 01 and 02 first. Build the node end-to-end before anything
   else. Nothing in this codebase makes sense until you have built it.
2. Read chapters 03-05 to get a structural map of consensus and networking.
   These chapters lean on Bitcoin Core background; if you are unfamiliar with
   Bitcoin, read Mastering Bitcoin chapters 5-9 in parallel.
3. Read chapters 06-08 in any order. They are the Zcash-specific parts.
4. Use chapter 10 as your week-by-week to-do list.
5. Use chapter 11 as the index of external authoritative sources.

## Conventions used in these files

- File paths are given as `src/foo/bar.cpp` and are relative to the repo root
  unless absolute.
- Function names are written in their on-disk form, e.g. `ContextualCheckBlock`.
- "Spec" without further qualification means the Zcash Protocol Specification
  at `https://zips.z.cash/protocol/protocol.pdf`.
- "ZIP-N" refers to Zcash Improvement Proposal N at `https://zips.z.cash`.

## What this course is not

- Not a tutorial on cryptography. It assumes you know what a Pedersen
  commitment, a Groth16 proof, a Schnorr signature, and a Merkle tree are.
- Not a tutorial on Bitcoin. It assumes you know what UTXO, script,
  P2PKH, transaction malleability, and difficulty adjustment are.
- Not a substitute for the Zcash Protocol Specification. The spec is the
  source of truth for consensus. This course teaches you how the spec is
  realised in code.
