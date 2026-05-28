---
sidebar_position: 9
title: "Testing"
description: "Five test layers (Rust unit, Boost.Test, GoogleTest, wallet tests, Python RPC integration), benchmarks, fuzzing, and cross-implementation differential testing."
---

# Testing

## 1. Why this chapter exists

There are five test layers in this repo. Knowing which to use is part
of being productive: a Python RPC test takes 30+ seconds of bring-up
overhead per run, a gtest takes a few seconds, and a Rust unit test
takes a few hundred milliseconds. Choosing wrong burns hours.

## 2. Definitions

**Definition 9.1 (Test layer).** A coherent group of tests sharing a
test framework, a build target, and a runner. The five layers in
zcashd are Rust unit, Boost.Test, GoogleTest, wallet tests, and
Python RPC.

**Definition 9.2 (Regtest).** A private regression-test network with
a near-zero proof-of-work target. Activations are configurable via
`-nuparams=` at startup. Used by Python RPC tests for end-to-end
behaviour.

**Definition 9.3 (Differential testing).** Running two implementations
(zcashd and zebra) against the same chain and comparing the per-block
state. Used for the highest-confidence consensus checks.

## 3. The code

### The five layers

1. **Rust unit tests** under `src/rust/src/` and the upstream
   `librustzcash` crates. Run with `cargo test`.
2. **C++ Bitcoin-Core inherited unit tests** under `src/test/`, using
   Boost.Test. Built as `test_bitcoin`. Run with `make -C src check`
   or `src/test/test_bitcoin --run_test=foo_tests`.
3. **C++ Zcash unit tests** under `src/gtest/`, using GoogleTest.
   Built as `zcash-gtest`. Run with `src/zcash-gtest` (optional
   `--gtest_filter=...`).
4. **C++ wallet tests** under `src/wallet/test/` and
   `src/wallet/gtest/`, two suites mirroring the split above.
5. **Python RPC integration tests** under `qa/rpc-tests/`, run with
   `qa/pull-tester/rpc-tests.py [test_name]`.

The full suite runner is
[qa/zcash/full_test_suite.py](https://github.com/zcash/zcash/blob/v5.5.0-rc1/qa/zcash/full_test_suite.py),
which runs all five layers in sequence. CI runs this.

### When to use which layer

| Want to test... | Use |
|----|----|
| A cryptographic primitive in isolation | Rust unit test in the relevant crate |
| Encoding/decoding logic | Rust unit test or C++ gtest |
| `CheckTransaction` semantics | `src/gtest/test_checktransaction.cpp` |
| A new consensus rule at a specific height | `src/gtest/test_consensus.cpp` plus an RPC test |
| End-to-end wallet behaviour | RPC test in `qa/rpc-tests/` |
| Behaviour across multiple nodes (reorgs, partition) | RPC test using `TestFramework` |
| Mempool corner cases | both unit and RPC |
| Bitcoin-script edge cases | `src/test/script_*_tests.cpp` |

### C++ unit tests in src/test/ (Boost.Test)

Inherited from Bitcoin Core 0.12. Each file is a
`BOOST_FIXTURE_TEST_SUITE` containing `BOOST_AUTO_TEST_CASE`
definitions.

```cpp reference title="src/test/test_bitcoin.h (fixture base classes)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/test/test_bitcoin.h#L1-L80
```

Fixtures:

- `BasicTestingSetup` (init args, ECC, chain params).
- `TestingSetup` (also creates a regtest scratch directory,
  validation state, mempool).
- `TestChain100Setup` (creates a 100-block chain so coinbase is
  mature).

Useful files to learn from:
[script_P2SH_tests.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/test/script_P2SH_tests.cpp),
[coins_tests.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/test/coins_tests.cpp),
[mempool_tests.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/test/mempool_tests.cpp),
[DoS_tests.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/test/DoS_tests.cpp).

Run:

```bash
make -C src check
src/test/test_bitcoin --run_test=mempool_tests
src/test/test_bitcoin --log_level=test_suite --run_test=DoS_tests
```

### C++ unit tests in src/gtest/ (GoogleTest)

Zcash-added tests. They use GoogleTest and have larger fixtures
because they exercise the full chain state, including shielded pools.

```cpp reference title="src/gtest/test_checktransaction.cpp (a representative gtest)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/gtest/test_checktransaction.cpp#L1-L80
```

Important files:

- [test_consensus.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/gtest/test_consensus.cpp):
  branch ID, activation height logic.
- [test_checkblock.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/gtest/test_checkblock.cpp),
  [test_checktransaction.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/gtest/test_checktransaction.cpp):
  the validation predicates.
- [test_joinsplit.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/gtest/test_joinsplit.cpp),
  [test_noteencryption.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/gtest/test_noteencryption.cpp),
  [test_pedersen_hash.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/gtest/test_pedersen_hash.cpp):
  crypto.
- [test_miner.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/gtest/test_miner.cpp):
  block template construction.
- [test_foundersreward.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/gtest/test_foundersreward.cpp),
  [test_keys.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/gtest/test_keys.cpp),
  [test_keystore.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/gtest/test_keystore.cpp):
  wallet-adjacent.
- [test_history.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/gtest/test_history.cpp):
  ZIP-221 history tree.
- [test_mempool.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/gtest/test_mempool.cpp),
  [test_mempoollimit.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/gtest/test_mempoollimit.cpp):
  mempool.
- [test_pow.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/gtest/test_pow.cpp):
  difficulty.
- [test_validation.cpp](https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/gtest/test_validation.cpp):
  the validation pipeline; one of the top-10 hot files in the repo.

Run:

```bash
src/zcash-gtest                                  # all tests
src/zcash-gtest --gtest_filter=ConsensusTest.*   # one test class
src/zcash-gtest --gtest_filter=*Sapling*         # by name pattern
```

### RPC tests in qa/rpc-tests/

Each `.py` file is one test. The harness `framework.py` provides a
`BitcoinTestFramework` base class that:

- Starts N (typically 4) regtest nodes on local ports.
- Optionally connects them.
- Provides RPC clients (`nodes[i]`).
- Tears down on exit.

```python reference title="qa/rpc-tests/test_framework/test_framework.py (BitcoinTestFramework)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/qa/rpc-tests/test_framework/test_framework.py#L1-L80
```

Skeleton:

```python
from test_framework.test_framework import BitcoinTestFramework
from test_framework.util import assert_equal

class MyTest(BitcoinTestFramework):
    def setup_chain(self):
        super().setup_chain()

    def run_test(self):
        self.nodes[0].generate(100)
        self.sync_all()
        addr = self.nodes[0].getnewaddress()
        assert_equal(self.nodes[0].getbalance(), expected)

if __name__ == '__main__':
    MyTest().main()
```

Run a single test:

```bash
qa/pull-tester/rpc-tests.py mempool_nu_activation.py
```

Run the whole suite (slow):

```bash
qa/pull-tester/rpc-tests.py
```

Tests are split into "passing" lists in `qa/pull-tester/rpc-tests.py`;
add new tests to the appropriate list there.

Key gotchas:

- Regtest mining is fast (low PoW) but generation is still
  synchronous; use `generate(N)` rather than spinning.
- `sync_all()` blocks until all nodes share the same tip.
- Activation heights on regtest are 1 by default for most NUs (so all
  rules are active). To test pre-activation logic, pass
  `-nuparams=branchid:height` to the nodes.
- The framework uses a pool of pre-mined blocks
  (`qa/rpc-tests/cache/`) to skip the slow initial generation; this
  cache is regenerated by `qa/rpc-tests/create_cache.py`.

### Rust tests

Run from the repo root:

```bash
cargo test                              # in-repo crate tests
cargo test --manifest-path src/rust/Cargo.toml -- some::module::tests
```

Tests live alongside source as `#[cfg(test)] mod tests { ... }`
blocks and under `src/rust/tests/`. For upstream `librustzcash`
crates, clone that repo and run its own test suite; many
cryptographic invariants are tested there, not here.

### Benchmarks

`src/bench/` (built as `bench_bitcoin`) contains microbenchmarks for
hashes, signature verification, mempool insertion, coin selection,
etc.

```cpp reference title="src/bench/bench.h (benchmark framework)"
https://github.com/zcash/zcash/blob/v5.5.0-rc1/src/bench/bench.h#L1-L60
```

Run:

```bash
src/bench/bench_bitcoin
src/bench/bench_bitcoin -filter=Sapling*
```

Use for performance regression checks before merging.

### Fuzzing

`src/fuzzing/` contains fuzz targets. Two drivers:

- AFL (`zcutil/afl/`) for traditional coverage-guided fuzzing.
- libFuzzer (`zcutil/libfuzzer/`) for in-process fuzzing with
  Clang/sanitizers.

Both run against the same harnesses. Active targets: deserialisation
of blocks, transactions, scripts, addresses. The fuzzers are not run
in CI by default; ZODL should put them on a regular schedule.

### Cross-implementation differential testing

For consensus, the strongest test is "do zcashd and zebra agree on
every block from genesis to tip?". ECC historically ran this as a
one-off check before releases. The mechanism is to point both nodes
at the same testnet/mainnet and diff their
`getblockchaininfo`/`getblock` outputs per block. The Zcash
Foundation has tooling for this; coordinate with them before
releasing a consensus-affecting change.

### What CI runs

[.github/workflows/](https://github.com/zcash/zcash/tree/v5.5.0-rc1/.github/workflows)
contains the GitHub Actions definitions. Roughly:

- `audits.yml`: cargo-vet and supply-chain checks.
- `book.yml`: builds the ECC user book.
- `checks.yml`: build on Debian/Ubuntu, with all the depends;
  `test_bitcoin`, `zcash-gtest`, the RPC test suite; Rust tests via
  `cargo test`.
- `lints.yml`: lint of source files (whitespace, header guards).

CI does NOT run fuzzers, does NOT run benchmarks, does NOT run
cross-implementation diff tests. Plan to backfill these on a periodic
schedule (nightly, weekly).

### Debugging tests

For a flaky RPC test, the most useful flag is:

```bash
qa/pull-tester/rpc-tests.py --nocleanup mempool_nu_activation.py
```

`--nocleanup` leaves the per-test data directories under
`/tmp/test...` so they can be inspected (`debug.log`, `wallet.dat`,
etc.).

For a failing gtest, run with `--gtest_break_on_failure` under `gdb`
to drop into the debugger at the assertion site.

For a Rust failure, `RUST_BACKTRACE=1 cargo test --release` and read
the panic location.

## 4. Failure modes

- **Adding a new RPC test without listing it in
  `qa/pull-tester/rpc-tests.py`.** The test is never run by CI.
  Caught by review only.
- **Forgetting `-nuparams=` for pre-activation regression tests.**
  All NUs are active on regtest by default, so the regression is
  silently skipped. Caught by careful reading of the test.
- **Relying on absolute paths in tests.** Breaks the test cache and
  parallel runs. Caught by the RPC harness when paths conflict.
- **Flake from `sync_all()` timing.** Increase the timeout; do not
  assume; rerunning is not a fix. Caught by repeated CI failure.
- **gtest fixture leak.** A fixture that allocates outside its
  destructor leaves state for the next test. Caught only by running
  the suite in random order.

## 5. Spec pointers

The test layout is not specified by the protocol; it is internal
convention. Relevant external references:

- [Google Test primer](https://google.github.io/googletest/primer.html).
- [Boost.Test docs](https://www.boost.org/doc/libs/release/libs/test/doc/html/index.html).
- [Bitcoin Core test framework docs](https://github.com/bitcoin/bitcoin/tree/master/test).
- [AFL docs](https://aflplus.plus/).

## 6. Exercises

1. **Run one of every layer.** Execute one
   `cargo test`, one `boost.test` (run a single suite), one
   `zcash-gtest --gtest_filter`, and one RPC test. Time each.

2. **Spot a missing test.** Find a `Misbehaving(...)` call in
   `src/main.cpp` for which there is no corresponding test in
   `src/test/DoS_tests.cpp`. Open an issue (or write the test).

3. **Add a regression.** Pick the most recent merged consensus PR
   from `git log src/main.cpp`; identify whether it added a test;
   if not, write one.

4. **Modification exercise.** Add a `--bench-zk` mode to
   `bench_bitcoin` that runs the Sapling spend verifier on a
   prepared test vector and reports verification time. Use it to
   compare batched vs unbatched cost on a 10-spend bundle.

## 7. Further reading

- The Bitcoin Core
  [test/README.md](https://github.com/bitcoin/bitcoin/blob/master/test/README.md)
  for the inherited Python test framework design.
- The
  [`proptest` Rust crate](https://github.com/proptest-rs/proptest)
  for property-based tests; consider for new consensus primitives.
