# 07 - Zero-knowledge proofs and shielded pools

This is the heart of Zcash. There are three shielded pools, each with its
own cryptography. Most of the code lives in Rust crates outside this
repository; zcashd integrates them.

Goal of this chapter: give you a precise mental model of each pool, the
files that implement it on each side, and the integration seams between
C++ and Rust.

## The three pools at a glance

| Pool | Proof system | Curve(s) | Hash inside circuit | Activation |
|------|--------------|----------|---------------------|------------|
| Sprout | Groth-Maller (PGHR13 with Groth-Maller transform) | BN-254 | SHA-256 + MiMC | genesis |
| Sapling | Groth16 | BLS12-381 (outer), Jubjub (inner) | Bowe-Hopwood Pedersen, BLAKE2s | NU3 (Sapling, 419200) |
| Orchard | Halo 2 (Plonkish, IPA-based) | Pallas (outer), Vesta (inner) (Pasta cycle) | Sinsemilla, Poseidon (in places) | NU5, 1687104 |

A single transaction can carry: transparent inputs/outputs, one or more
Sprout JoinSplits, a Sapling bundle (with N spends and M outputs), and an
Orchard bundle (with N actions, each one spend + one output). The
"turnstile" property (ZIP-209) tracks net value moving between pools and
the transparent layer.

## Data structures: where pools live in a transaction

Read `src/primitives/transaction.h`. The `CTransaction` fields evolved
through transaction versions:

- v1, v2 (pre-Overwinter): no Sapling, no Orchard; JoinSplits encoded
  inline.
- v3 (Overwinter): adds `nExpiryHeight`, `nConsensusBranchId`, expiry
  rules; JoinSplits still present.
- v4 (Sapling, post-NU3): adds `vShieldedSpend`, `vShieldedOutput`,
  `valueBalanceSapling`, `bindingSig`. JoinSplits remain (Sprout coexists
  with Sapling).
- v5 (NU5, ZIP-225): repackaged layout with explicit pool sections; adds
  the Orchard bundle and removes the Sprout JoinSplit fields (Sprout can
  still hold funds, but a v5 transaction has no JoinSplit).

The Orchard bundle is stored on the C++ side as an opaque pointer
(`OrchardBundle` in `src/primitives/orchard.h`) wrapping the Rust
`orchard::Bundle`. All Orchard logic lives in Rust.

## Sprout

Sprout is the original Zerocash construction. It uses the PGHR13 zk-SNARK
on the BN-254 curve.

### Files

| Location | Role |
|----------|------|
| `src/zcash/JoinSplit.{hpp,cpp}` | JoinSplit wrapper, key generation |
| `src/zcash/Note.{hpp,cpp}` | Sprout note type and commitment |
| `src/zcash/NoteEncryption.{hpp,cpp}` | Sprout in-band note encryption (ChaCha20Poly1305 + a Sprout-specific KDF) |
| `src/zcash/Proof.hpp` | C++ representation of BN-254 group elements; `PHGRProof`, `GrothProof` |
| `src/zcash/prf.{h,cpp}` | Sprout PRFs (BLAKE2b-based) |
| `src/zcash/IncrementalMerkleTree.{hpp,cpp}` | the Sprout commitment tree |
| `src/proof_verifier.cpp` | wraps the Rust verifier behind a C++ class |
| `src/rust/src/rustzcash.rs` | `librustzcash_sprout_*` FFI functions; Sprout proof verification (uses `zcash_proofs::sprout`) |

### Lifecycle

A JoinSplit takes up to 2 input notes and produces up to 2 output notes.
The proof attests:

- Knowledge of the openings of the input commitments.
- The input commitments are in the Merkle tree at the asserted root.
- The nullifiers were computed correctly (so spent notes are revealed
  exactly once).
- Output notes are properly committed.
- Value conservation: `vpub_old + sum(inputs) = vpub_new + sum(outputs)`.

`vpub_old` is value entering the shielded side from transparent;
`vpub_new` is value leaving to transparent. They are public per
JoinSplit.

### Operational notes

Sprout is essentially in maintenance. Funds in Sprout should be migrated
out (the wallet has a `saplingmigration` async operation for this). The
historical counterfeiting bug (CVE-2019-7167) was in the original Sprout
parameters and is patched here by using the "Sprout-Groth16" parameters
(see `sprout-groth16.params` distributed by `fetch-params.sh`).

A node that does not have `sprout-groth16.params` cannot verify
JoinSplits. The parameter file is loaded at startup by
`librustzcash_init_zksnark_params`.

## Sapling

Sapling is the second-generation construction. It uses Groth16 on
BLS12-381 with Jubjub as the in-circuit curve. The major design wins
over Sprout: spends and outputs are independent (a single tx can have
many of each), proofs are ~50x smaller, verification is ~50x faster.

### Files

C++ shims:

| Location | Role |
|----------|------|
| `src/primitives/transaction.h` (`SpendDescription`, `OutputDescription`) | the on-wire structures |
| `src/main.cpp` (`ContextualCheckTransaction`, `ConnectBlock`) | activation gating, batch verification calls |
| `src/transaction_builder.cpp` | C++ side of transaction construction; for Sapling it calls into Rust |
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
`zcash_primitives::sapling::*` (in the `librustzcash` workspace upstream).

### Sapling primitives

- **Note** = `(diversifier d, pkd, value v, randomness rcm)`.
- **Note commitment** = a Pedersen commitment over Jubjub of
  `(g_d, pk_d, v, rcm)` using domain-separated bases.
- **Nullifier** = `PRF_nf^{Sapling}(nk, rho)` where `rho` is a unique
  per-note value derived from the commitment.
- **Spend Authorisation key** `ask` -> `ak`, `nullifier deriving key`
  `nsk` -> `nk`. Together: full viewing key `(ak, nk, ovk)`.
- **Incoming viewing key** `ivk = CRH^{ivk}(ak, nk)`.
- **Diversifier** `d` is an 11-byte randomness that, with `ivk`, gives a
  payment address `(d, pk_d = [ivk] g_d)`. A user can hand out many
  addresses from one viewing key.

The Sapling spend proof attests, in zero knowledge:

- The note commitment is in the tree at the asserted Merkle root.
- The spend authority key `ak` matches.
- The nullifier is computed correctly.
- Value, randomness, and Pedersen commitments are consistent.

The Sapling output proof attests that the output commitment is
well-formed.

The binding signature ties together the value commitments so that the
*difference* of value commitments minus `valueBalance` equals
`[balance] * H` for a known generator, with key `bsk` known only to the
prover.

### Batched validation

Reading `src/rust/src/sapling.rs::BatchValidator` is the easiest way to
see how spend/output verification is amortised across an entire block.

## Orchard

Orchard is the Halo 2 generation. No trusted setup. Pallas/Vesta cycle.
Spend and output are merged into a single "Action" so that a transaction
is *uniform* in shape, which gives strictly better anonymity than
separate spends/outputs.

### Files

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

The cryptography lives in the `orchard` crate
(`https://github.com/zcash/orchard`).

### Orchard primitives

- **Sinsemilla** is the in-circuit hash. Constant-time in-circuit
  computation; based on incomplete addition; faster than Pedersen in
  Halo 2 because of the Plonkish layout.
- **Pallas/Vesta** are a 2-cycle of curves: each one's scalar field is
  the other's base field. This is what makes recursive Halo 2 possible
  in principle (zcashd does not yet use recursion).
- **Note commitment** is Sinsemilla-based.
- **Nullifier** uses Poseidon-like hashing (verify the spec for current
  details; this evolved during 2021).
- **Action** = one spend + one output. Always has both: a "dummy"
  spend or output can hide whether the action is creating, destroying,
  or transferring.

Read the Orchard book at `https://zcash.github.io/orchard/` and the
"Orchard cryptography" section of the protocol spec.

## Wallet scanning (trial decryption)

Each shielded output is encrypted to its recipient. The recipient
"scans" the chain by trial-decrypting every output with each incoming
viewing key. zcashd has gone through several generations of scanner:

- The legacy per-block scanner in `src/wallet/wallet.cpp` (still used
  for Sprout).
- The Sapling batch scanner in `src/rust/src/wallet_scanner.rs`, which
  pipelines decryption across blocks and uses multiple threads.
- The Orchard scanner uses the same overall design.

The cost of scanning grows with chain length times number of viewing
keys, and is the dominant CPU cost for a heavily-shielded wallet. This
is exactly the cost that ZSA / FROST / wallet-side improvements aim to
reduce.

## Note encryption format

Read `zcash_note_encryption` (in `librustzcash`). The protocol is the
same shape for Sapling and Orchard:

- `epk` (ephemeral public key) is in the output description.
- `enc_ciphertext` carries the note plaintext (value, memo, rseed).
- `out_ciphertext` carries the data needed by a *holder of the outgoing
  viewing key* (ovk) to also decrypt the output, so wallets can
  reconstruct their own outgoing transactions.

The recipient computes `shared_secret = KA(esk, pkd)`, runs a KDF
(BLAKE2b with a personalisation), and decrypts with ChaCha20-Poly1305
(Sapling) or an Orchard-specific AEAD.

## Trusted setup parameters

```
sprout-groth16.params      Sprout Groth16 parameters (post-CVE fix)
sapling-spend.params       Sapling spend proving key
sapling-output.params      Sapling output proving key
sapling-spend-verify.params and sapling-output-verify.params (computed)
```

Distributed via `zcutil/fetch-params.sh`; loaded by
`librustzcash_init_zksnark_params`. The MPC ceremonies that produced
these are documented at:

- Sprout: `https://github.com/zcash/mpc`
- Sapling powers-of-tau: `https://github.com/zcash-hackworks/powersoftau-attestations`
- Sapling phase 2: `https://github.com/zcash-hackworks/sapling-mpc`

Orchard parameters are deterministically derived (no ceremony) and live
inside the `orchard` crate.

## Proof verification flow

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

So in the common case, `ConnectBlock` only has to verify bundles that
were not already in the mempool.

## When you will touch this code

The most common kinds of work:

1. **Wallet integration of a new feature**: read the protocol section,
   implement on the Rust side in `librustzcash`, expose via FFI in
   `src/rust/`, call from `src/wallet/`.
2. **A consensus change**: implement on the Rust side, expose, gate on
   activation height in `src/main.cpp`, add tests in both `src/gtest/`
   and `qa/rpc-tests/`.
3. **Performance improvement** (batch sizes, scanner pipeline,
   bundle cache tuning): mostly in `src/rust/src/`.

You should expect to spend most of your time editing Rust, not C++.

## Testing zk paths

- `src/gtest/test_pedersen_hash.cpp`, `test_noteencryption.cpp`,
  `test_joinsplit.cpp` for primitives.
- `src/gtest/test_checktransaction.cpp` for transaction-level rules
  including Sapling/Orchard activation rules.
- `qa/rpc-tests/finalsaplingroot.py`, `finalorchardroot.py`,
  `wallet_orchard.py` (and similar) for end-to-end.

## Recommended deepening reads

- Zcash Protocol Specification, sections 4 (concepts), 5 (primitives),
  6 (consensus), 7 (consensus rules per NU), 8 (transactions).
- The "Sapling cryptography" series of blog posts by Sean Bowe (on the
  ECC blog and z.cash).
- "Halo 2" book at `https://zcash.github.io/halo2/`.
- "Orchard book" at `https://zcash.github.io/orchard/`.
- The Zerocash paper (2014) for Sprout context.
- The Sapling paper / spec for the Pedersen and Jubjub design choices.
- The Halo 2 paper for the IPA argument and the recursion construction.
