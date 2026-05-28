---
sidebar_position: 7
title: "zk-SNARKs and shielded pools"
description: "Sprout, Sapling, Orchard. The three NP relations zcashd proves, the curves and proof systems, the batched validators, and where to look in librustzcash."
---

# zk-SNARKs and shielded pools

## 1. Why this chapter exists

The shielded pools are the reason Zcash exists. There are three;
each has its own cryptography, its own NP relation, and its own
performance regime. Most of the code lives in Rust crates outside
this repository; zcashd integrates them.

Goal: give a precise mental model of each pool, the files that
implement it on each side, and the integration seams between C++ and
Rust. The cryptographic statements are stated formally; the code
walk identifies where each statement is enforced.

## 2. Definitions

### The three pools at a glance

| Pool | Proof system | Curve(s) | Hash inside circuit | Activation |
|------|--------------|----------|---------------------|------------|
| Sprout | Groth16 (post-CVE Sprout-Groth16) | BN-254 | SHA-256 + MiMC | genesis |
| Sapling | Groth16 | BLS12-381 (outer), Jubjub (inner) | Bowe-Hopwood Pedersen, BLAKE2s | NU3 (419200) |
| Orchard | Halo 2 (Plonkish, IPA-based) | Pallas (outer), Vesta (inner) | Sinsemilla, Poseidon | NU5 (1687104) |

A single transaction can carry transparent inputs/outputs, one or
more Sprout JoinSplits, a Sapling bundle (with $N$ spends and $M$
outputs), and an Orchard bundle (with $N$ actions, each one spend +
one output). The "turnstile" property
([ZIP-209](https://zips.z.cash/zip-0209)) tracks net value moving
between pools and the transparent layer.

### The Sapling NP relation

**Definition 7.1 (Sapling spend relation $R^{\mathsf{Sapling}}_{\mathsf{spend}}$).**
Public input
$x = (\mathsf{rt}, \mathsf{cv}, \mathsf{nf}, \mathsf{rk})$ where
$\mathsf{rt}$ is the Sapling note commitment tree root, $\mathsf{cv}$
is a value commitment, $\mathsf{nf}$ is a nullifier, and $\mathsf{rk}$
is a randomised verification key. Witness
$w = (\mathsf{path}, \mathsf{pos}, g_d, \mathsf{pk}_d, v, \mathsf{rcv},
\mathsf{rcm}, \alpha, \mathsf{ak}, \mathsf{nsk})$.
The relation holds iff all of the following:

1. The note
   $\mathsf{note} = (g_d, \mathsf{pk}_d, v, \mathsf{rcm})$ commits
   to a leaf at $(\mathsf{path}, \mathsf{pos})$ of a tree with root
   $\mathsf{rt}$.
2. $\mathsf{cv} = \mathsf{Com}(v; \mathsf{rcv})$ over the Jubjub
   value-commitment generator.
3. $\mathsf{nf} = \mathsf{PRF}_{\mathsf{nk}}^{\mathsf{nfSapling}}
   (\mathsf{cm} \mathbin{\\|} \mathsf{pos})$ where $\mathsf{nk}$ is
   derived from $\mathsf{nsk}$.
4. $\mathsf{rk} = [\alpha]\mathsf{SpendAuthGen} + \mathsf{ak}$.
5. $g_d \ne 0$ and $\mathsf{pk}_d \ne 0$.

**Definition 7.2 (Sapling output relation $R^{\mathsf{Sapling}}_{\mathsf{output}}$).**
Public input $x = (\mathsf{cv}, \mathsf{cm}, \mathsf{epk})$.
Witness $w = (g_d, \mathsf{pk}_d, v, \mathsf{rcv}, \mathsf{rcm},
\mathsf{esk})$. The relation holds iff:

1. $\mathsf{cv} = \mathsf{Com}(v; \mathsf{rcv})$.
2. $\mathsf{cm} = \mathsf{NoteCommit}^{\mathsf{Sapling}}
   (g_d, \mathsf{pk}_d, v, \mathsf{rcm})$.
3. $\mathsf{epk} = [\mathsf{esk}] g_d$.
4. $g_d \ne 0$.

**Theorem 7.3 (Sapling knowledge soundness).** Under the
$q$-Strong Diffie-Hellman assumption on BLS12-381, the Groth16
proof system is knowledge-sound for any NP relation. Therefore an
adversary producing a verifying proof for
$R^{\mathsf{Sapling}}_{\mathsf{spend}}$ or
$R^{\mathsf{Sapling}}_{\mathsf{output}}$ must know a witness $w$.
Soundness requires the structured reference string (the Sapling
parameters) to be unknown to the adversary, which is the role of the
MPC ceremony.

### The Orchard NP relation

**Definition 7.4 (Orchard action relation $R^{\mathsf{Orchard}}$).**
Public input
$x = (\mathsf{rt}, \mathsf{cv}^{\mathsf{net}}, \mathsf{nf},
\mathsf{rk}, \mathsf{cm}_x, \mathsf{ephemeral})$. Witness $w$ is
the union of the data needed for a spend and an output (always both,
to make actions indistinguishable in shape). The relation holds iff
the spend and output sub-relations both hold, with the additional
constraint that the action is non-degenerate (the spend is dummy iff
$v_{\mathsf{old}} = 0$ and similarly for the output).

**Theorem 7.5 (Orchard knowledge soundness).** Under the discrete
logarithm assumption on the Pallas curve, the Halo 2 proof system
is knowledge-sound in the random oracle model. No trusted setup is
required.

### Data structures: where pools live in a transaction

Read `src/primitives/transaction.h`. The `CTransaction` fields
evolved through transaction versions:

- v1, v2 (pre-Overwinter): no Sapling, no Orchard; JoinSplits encoded
  inline.
- v3 (Overwinter): adds `nExpiryHeight`, `nConsensusBranchId`, expiry
  rules; JoinSplits still present.
- v4 (Sapling, post-NU3): adds `vShieldedSpend`, `vShieldedOutput`,
  `valueBalanceSapling`, `bindingSig`. JoinSplits remain (Sprout
  coexists with Sapling).
- v5 (NU5, ZIP-225): repackaged layout with explicit pool sections;
  adds the Orchard bundle and removes the Sprout JoinSplit fields
  (Sprout can still hold funds, but a v5 transaction has no
  JoinSplit).

The Orchard bundle is stored on the C++ side as an opaque pointer
(`OrchardBundle` in `src/primitives/orchard.h`) wrapping the Rust
`orchard::Bundle`. All Orchard logic lives in Rust.

## 3. The code

### Sprout

The original Zerocash construction. Uses Groth16 on BN-254 with
patched parameters (post-CVE-2019-7167).

| Location | Role |
|----------|------|
| `src/zcash/JoinSplit.{hpp,cpp}` | JoinSplit wrapper, key generation |
| `src/zcash/Note.{hpp,cpp}` | Sprout note type and commitment |
| `src/zcash/NoteEncryption.{hpp,cpp}` | Sprout in-band note encryption |
| `src/zcash/Proof.hpp` | C++ representation of BN-254 group elements |
| `src/zcash/prf.{h,cpp}` | Sprout PRFs (BLAKE2b-based) |
| `src/zcash/IncrementalMerkleTree.{hpp,cpp}` | the Sprout commitment tree |
| `src/proof_verifier.cpp` | wraps the Rust verifier behind a C++ class |
| `src/rust/src/rustzcash.rs` | `librustzcash_sprout_*` FFI; uses `zcash_proofs::sprout` |

A JoinSplit takes up to 2 input notes and produces up to 2 output
notes. The proof attests:

- Knowledge of the openings of the input commitments.
- The input commitments are in the Merkle tree at the asserted root.
- The nullifiers were computed correctly.
- Output notes are properly committed.
- Value conservation:
  $v_{\mathsf{pub,old}} + \sum_i v^{\mathsf{in}}_i =
  v_{\mathsf{pub,new}} + \sum_j v^{\mathsf{out}}_j$.

$v_{\mathsf{pub,old}}$ is value entering the shielded side from
transparent; $v_{\mathsf{pub,new}}$ is value leaving to transparent.
They are public per JoinSplit.

#### Operational notes

Sprout is essentially in maintenance. Funds in Sprout should be
migrated out; the wallet has a `saplingmigration` async operation
for this. The historical counterfeiting bug (CVE-2019-7167) was in
the original Sprout parameters and is patched here by using the
Sprout-Groth16 parameters (see `sprout-groth16.params` distributed
by `fetch-params.sh`).

A node that does not have `sprout-groth16.params` cannot verify
JoinSplits. The parameter file is loaded at startup by
`librustzcash_init_zksnark_params`.

### Sapling

The second-generation construction. Groth16 on BLS12-381 with Jubjub
as the in-circuit curve. Major wins over Sprout: spends and outputs
are independent (a single tx can have many of each), proofs are
~50x smaller, verification is ~50x faster.

C++ shims:

| Location | Role |
|----------|------|
| `src/primitives/transaction.h` | on-wire `SpendDescription`, `OutputDescription` |
| `src/main.cpp` | activation gating, batch verification calls |
| `src/transaction_builder.cpp` | C++ side of transaction construction |
| `src/proof_verifier.cpp` | per-transaction Sapling verifier (now mostly superseded by batch) |

Rust shims and integration:

| Location | Role |
|----------|------|
| `src/rust/src/sapling.rs` | Sapling bundle assembly and per-bundle verifier; batch validator wrapped via cxx |
| `src/rust/src/note_encryption.rs` | Sapling note decryption, including the batch trial-decryption pipeline |
| `src/rust/src/wallet_scanner.rs` | the streaming scanner that decrypts outputs in parallel as blocks arrive |
| `src/rust/src/incremental_merkle_tree.rs` | the bridge to `incrementalmerkletree` for Sapling and Orchard |
| `src/rust/src/merkle_frontier.rs` | the persistent frontier representation |
| `src/rust/src/bundlecache.rs` | per-bundle verification cache |
| `src/rust/src/builder_ffi.rs` | builder API for FFI consumers |

The Rust libraries doing the actual cryptography are in
`zcash_primitives::sapling::*` (in the `librustzcash` workspace
upstream).

```rust reference title="src/rust/src/sapling.rs (BatchValidator entry)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/sapling.rs#L1-L100
```

#### Sapling primitives

- **Note** = $(\mathsf{diversifier}\ d, \mathsf{pk}_d, \mathsf{value}\ v, \mathsf{rcm})$.
- **Note commitment** = a Pedersen commitment over Jubjub of
  $(g_d, \mathsf{pk}_d, v, \mathsf{rcm})$ using domain-separated
  bases.
- **Nullifier** = $\mathsf{PRF}_{\mathsf{nk}}^{\mathsf{nf,Sapling}}(\rho)$
  where $\rho$ is a unique per-note value derived from the
  commitment.
- **Spend authorisation key** $\mathsf{ask} \to \mathsf{ak}$,
  **nullifier deriving key** $\mathsf{nsk} \to \mathsf{nk}$.
  Together: full viewing key $(\mathsf{ak}, \mathsf{nk}, \mathsf{ovk})$.
- **Incoming viewing key** $\mathsf{ivk} =
  \mathsf{CRH}^{\mathsf{ivk}}(\mathsf{ak}, \mathsf{nk})$.
- **Diversifier** $d$: an 11-byte randomness that, with
  $\mathsf{ivk}$, gives a payment address
  $(d, \mathsf{pk}_d = [\mathsf{ivk}] g_d)$. A user can hand out
  many addresses from one viewing key.

The Sapling spend proof attests
$R^{\mathsf{Sapling}}_{\mathsf{spend}}$ from Definition 7.1. The
Sapling output proof attests
$R^{\mathsf{Sapling}}_{\mathsf{output}}$ from Definition 7.2.

The binding signature ties together the value commitments so that the
*difference* of value commitments minus
$\mathsf{valueBalance}$ equals $[\mathsf{balance}] \cdot H$ for a
known generator, with key $\mathsf{bsk}$ known only to the prover.

#### Batched validation

Reading `src/rust/src/sapling.rs::BatchValidator` is the easiest
way to see how spend/output verification is amortised across an
entire block.

### Orchard

The Halo 2 generation. No trusted setup. Pallas/Vesta cycle. Spend
and output are merged into a single "Action" so that a transaction
is uniform in shape; this gives strictly better anonymity than
separate spends/outputs.

C++ shims:

| Location | Role |
|----------|------|
| `src/primitives/orchard.h` | opaque `OrchardBundle` holding a Rust `orchard::Bundle` via cxx |
| `src/primitives/transaction.h` (v5 fields) | the on-wire layout |
| `src/wallet/orchard.{h,cpp}` | wallet-side Orchard integration (calls Rust) |

Rust shims:

| Location | Role |
|----------|------|
| `src/rust/src/orchard_bundle.rs` | bundle parsing and reconstruction |
| `src/rust/src/orchard_ffi.rs` | batch validator, FFI entry points |
| `src/rust/src/orchard_keys_ffi.rs` | key derivation FFI |
| `src/rust/src/zcashd_orchard.rs` | wallet-specific glue |
| `src/rust/src/merkle_frontier.rs` | Orchard tree frontier |

```rust reference title="src/rust/src/orchard_ffi.rs (Orchard batch validator FFI)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/rust/src/orchard_ffi.rs#L1-L80
```

The cryptography lives in the `orchard` crate at
[github.com/zcash/orchard](https://github.com/zcash/orchard).

#### Orchard primitives

- **Sinsemilla** is the in-circuit hash. Constant-time in-circuit
  computation; based on incomplete addition; faster than Pedersen in
  Halo 2 because of the Plonkish layout.
- **Pallas/Vesta** are a 2-cycle of curves: each one's scalar field
  is the other's base field. This is what makes recursive Halo 2
  possible in principle (zcashd does not yet use recursion).
- **Note commitment** is Sinsemilla-based.
- **Nullifier** uses Poseidon-like hashing (verify the spec for
  current details).
- **Action** = one spend + one output. Always has both: a "dummy"
  spend or output can hide whether the action is creating,
  destroying, or transferring.

Read the [Orchard book](https://zcash.github.io/orchard/) and the
"Orchard cryptography" section of the protocol spec.

### Wallet scanning (trial decryption)

Each shielded output is encrypted to its recipient. The recipient
scans the chain by trial-decrypting every output with each incoming
viewing key. zcashd has gone through several generations of scanner:

- The legacy per-block scanner in `src/wallet/wallet.cpp` (still
  used for Sprout).
- The Sapling batch scanner in `src/rust/src/wallet_scanner.rs`,
  which pipelines decryption across blocks and uses multiple
  threads.
- The Orchard scanner uses the same overall design.

The cost of scanning grows with chain length times number of
viewing keys, and is the dominant CPU cost for a heavily-shielded
wallet.

### Note encryption format

Read `zcash_note_encryption` (in `librustzcash`). The protocol is
the same shape for Sapling and Orchard:

- $\mathsf{epk}$ (ephemeral public key) is in the output description.
- $\mathsf{enc\_ciphertext}$ carries the note plaintext (value, memo,
  rseed).
- $\mathsf{out\_ciphertext}$ carries the data needed by a *holder of
  the outgoing viewing key* ($\mathsf{ovk}$) to also decrypt the
  output, so wallets can reconstruct their own outgoing transactions.

The recipient computes
$\mathsf{shared\_secret} = \mathsf{KA}(\mathsf{esk}, \mathsf{pk}_d)$,
runs a KDF (BLAKE2b with a personalisation), and decrypts with
ChaCha20-Poly1305 (Sapling) or an Orchard-specific AEAD.

### Trusted setup parameters

```
sprout-groth16.params       Sprout Groth16 parameters (post-CVE fix)
sapling-spend.params        Sapling spend proving key
sapling-output.params       Sapling output proving key
sapling-spend-verify.params and sapling-output-verify.params (computed)
```

Distributed via `zcutil/fetch-params.sh`; loaded by
`librustzcash_init_zksnark_params`. The MPC ceremonies that produced
these are documented at:

- Sprout: [github.com/zcash/mpc](https://github.com/zcash/mpc)
- Sapling powers-of-tau:
  [github.com/zcash-hackworks/powersoftau-attestations](https://github.com/zcash-hackworks/powersoftau-attestations)
- Sapling phase 2:
  [github.com/zcash-hackworks/sapling-mpc](https://github.com/zcash-hackworks/sapling-mpc)

Orchard parameters are deterministically derived (no ceremony) and
live inside the `orchard` crate.

### Proof verification flow

For a Sapling spend in a freshly-arrived block:

```
ProcessMessage(block)
  ProcessNewBlock
    AcceptBlock
      CheckBlock
        CheckTransaction          # serialization, balance, basic shape
      ContextualCheckBlock
        ContextualCheckTransaction  # NU rules, version groups, expiry
    ActivateBestChain
      ConnectTip
        ConnectBlock
          for each tx:
            check shielded inputs (nullifier set, anchor)
            queue Sapling spends/outputs into BatchValidator
            queue Orchard actions into BatchValidator
          BatchValidator::validate     # one Rust call validates the whole block
          if invalid: reject block
```

Two-level caching prevents redundant work:

- Mempool acceptance already validated each transaction's bundles.
- The bundle cache (`bundlecache.rs`) memoises bundle validity.

So in the common case, `ConnectBlock` only has to verify bundles
that were not already in the mempool.

## 4. Failure modes

- **Verifying a Sapling proof against the wrong parameters.** The
  parameters are loaded at startup; a botched
  `librustzcash_init_zksnark_params` accepts proofs that should be
  rejected (or vice versa). Caught by:
  `src/gtest/test_joinsplit.cpp` for Sprout; upstream tests for
  Sapling.
- **Skipping the bundle cache.** Verifies the same bundle twice
  (once in mempool, once in block); performance bug only. Caught
  by benchmarking.
- **Building a Sapling tx with mismatched value commitments.** The
  binding signature fails. Caught by the verifier;
  `src/gtest/test_checktransaction.cpp` exercises some cases.
- **Sprout pool counterfeiting (CVE-2019-7167).** Defended by
  shipping patched parameters. No automated regression test in this
  workspace; caught at parameter-load time.
- **Orchard action accepted with a zero ephemeral key.** Action would
  be invalid; circuit catches it. Caught by: upstream `orchard`
  crate tests.

## 5. Spec pointers

- [Protocol Specification, section 4 (Concepts)](https://zips.z.cash/protocol/protocol.pdf)
  for the shielded-protocol model.
- [Protocol Specification, section 5 (Cryptographic Primitives)](https://zips.z.cash/protocol/protocol.pdf)
  for the in-circuit hashes.
- [Protocol Specification, section 7 (Consensus Changes)](https://zips.z.cash/protocol/protocol.pdf)
  for the per-NU rules that gate shielded acceptance.
- [ZIP-225](https://zips.z.cash/zip-0225): v5 transaction format.
- [ZIP-224](https://zips.z.cash/zip-0224): Orchard Action description.

## 6. Exercises

1. **Identify a relation clause in code.** Pick one clause from
   Definition 7.1 and find the line in `src/rust/src/sapling.rs` (or
   upstream `zcash_proofs::sapling`) where the verifier checks it.

2. **Reproduce a known test vector.** Pull one Sapling spend test
   vector from `src/gtest/test_checktransaction.cpp` or
   upstream `zcash_test_vectors`. Decode, identify the value
   commitments, and compute the binding signature key by hand.

3. **Construct an Orchard transaction.** On regtest with NU5 active,
   `z_sendmany` from a unified address to a unified address.
   Inspect the resulting transaction with `zcash-inspect` and
   identify the action group: anchor, cv_net, nullifier, rk, cmx,
   ephemeral key, enc/out ciphertexts.

4. **Modification exercise.** Add a log line in
   `BatchValidator::validate` (Sapling side) that prints the bundle
   size and the elapsed verification time at INFO level under
   `-debug=zk`. Use it to characterise the cost of a 1-spend vs
   16-spend bundle.

## 7. Further reading

- The Zerocash paper (Sasson et al., 2014) for Sprout context.
- Bowe et al., "Sapling: A Privacy-Preserving Cryptocurrency for the
  Decentralized Web" (the Sapling paper / spec for the Pedersen and
  Jubjub design choices).
- Bowe, Grigg, Hopwood, "Halo: Recursive Proof Composition without
  a Trusted Setup", 2019.
- [Halo 2 book](https://zcash.github.io/halo2/) for the IPA argument
  and the recursion construction.
- [Orchard book](https://zcash.github.io/orchard/).
- Groth, "On the Size of Pairing-Based Non-interactive Arguments",
  EUROCRYPT 2016 (Groth16).
