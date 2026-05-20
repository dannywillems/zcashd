# 09 - Testing

There are five test layers in this repo. Knowing which one to use is part
of being productive: a Python RPC test takes 30+ seconds of bring-up
overhead per run, a gtest takes a few seconds, and a Rust unit test
takes a few hundred milliseconds.

## The five layers

1. **Rust unit tests** under `src/rust/src/` and the upstream `librustzcash`
   crates. Run with `cargo test`.
2. **C++ Bitcoin-Core inherited unit tests** under `src/test/`, using
   Boost.Test. Built as `test_bitcoin`. Run with `make -C src check` or
   `src/test/test_bitcoin --run_test=foo_tests`.
3. **C++ Zcash unit tests** under `src/gtest/`, using GoogleTest. Built
   as `zcash-gtest`. Run with `src/zcash-gtest` (with optional
   `--gtest_filter=...`).
4. **C++ wallet tests** under `src/wallet/test/` and
   `src/wallet/gtest/`, two suites mirroring the split above.
5. **Python RPC integration tests** under `qa/rpc-tests/`, run with
   `qa/pull-tester/rpc-tests.py [test_name]`.

The full suite runner is `qa/zcash/full_test_suite.py`, which runs all
five layers in sequence. CI runs this.

## When to use which layer

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

## C++ unit tests in src/test/ (Boost.Test)

Inherited from Bitcoin Core 0.12. Each file is a `BOOST_FIXTURE_TEST_SUITE`
containing `BOOST_AUTO_TEST_CASE` definitions:

```cpp
BOOST_FIXTURE_TEST_SUITE(my_tests, TestingSetup)

BOOST_AUTO_TEST_CASE(my_test_case) {
    BOOST_CHECK(...);
    BOOST_CHECK_EQUAL(a, b);
}

BOOST_AUTO_TEST_SUITE_END()
```

Fixtures (in `src/test/test_bitcoin.h`):

- `BasicTestingSetup` (init args, ECC, chain params).
- `TestingSetup` (also creates a regtest scratch directory, validation
  state, mempool).
- `TestChain100Setup` (creates a 100-block chain so coinbase is mature).

Useful files to learn from: `script_P2SH_tests.cpp`, `coins_tests.cpp`,
`mempool_tests.cpp`, `addrman_tests.cpp`, `DoS_tests.cpp`.

Run:

```
make -C src check
src/test/test_bitcoin --run_test=mempool_tests
src/test/test_bitcoin --log_level=test_suite --run_test=DoS_tests
```

## C++ unit tests in src/gtest/ (GoogleTest)

These are the Zcash-added tests. They use GoogleTest and have larger
fixtures because they exercise the full chain state, including shielded
pools.

```cpp
TEST(MyTests, SomeBehaviour) {
    SelectParams(CBaseChainParams::REGTEST);
    // ...
    EXPECT_TRUE(...);
    ASSERT_EQ(a, b);
}
```

Important files:

- `test_consensus.cpp`: branch ID, activation height logic.
- `test_checkblock.cpp`, `test_checktransaction.cpp`: the validation
  predicates.
- `test_joinsplit.cpp`, `test_noteencryption.cpp`, `test_pedersen_hash.cpp`:
  crypto.
- `test_miner.cpp`: block template construction.
- `test_foundersreward.cpp`, `test_keys.cpp`, `test_keystore.cpp`:
  wallet-adjacent.
- `test_history.cpp`: ZIP-221 history tree.
- `test_mempool.cpp`, `test_mempoollimit.cpp`: mempool.
- `test_pow.cpp`: difficulty.

Run:

```
src/zcash-gtest                                  # all tests
src/zcash-gtest --gtest_filter=ConsensusTest.*   # one test class
src/zcash-gtest --gtest_filter=*Sapling*         # by name pattern
```

## RPC tests in qa/rpc-tests/

Each `.py` file is one test. The harness `framework.py` provides a
`BitcoinTestFramework` base class that:

- Starts N (typically 4) regtest nodes on local ports.
- Optionally connects them.
- Provides RPC clients (`nodes[i]`).
- Tears down on exit.

Skeleton:

```python
from test_framework.test_framework import BitcoinTestFramework
from test_framework.util import assert_equal

class MyTest(BitcoinTestFramework):
    def setup_chain(self):
        # default: 4 nodes
        super().setup_chain()

    def run_test(self):
        self.nodes[0].generate(100)
        self.sync_all()
        addr = self.nodes[0].getnewaddress()
        # ...
        assert_equal(self.nodes[0].getbalance(), expected)

if __name__ == '__main__':
    MyTest().main()
```

Run a single test:

```
qa/pull-tester/rpc-tests.py mempool_nu_activation.py
```

Run the whole suite (slow):

```
qa/pull-tester/rpc-tests.py
```

Tests are split into "passing" lists in `qa/pull-tester/rpc-tests.py`;
add new tests to the appropriate list there.

Key gotchas:

- Regtest mining is fast (low PoW) but generation is still synchronous;
  use `generate(N)` rather than spinning.
- `sync_all()` blocks until all nodes share the same tip.
- Activation heights on regtest are 1 by default for most NUs (so all
  rules are active). To test pre-activation logic you must pass
  `-nuparams=branchid:height` to the nodes.
- The framework uses a pool of pre-mined blocks (`qa/rpc-tests/cache/`)
  to skip the slow initial generation; this cache is regenerated by
  `qa/rpc-tests/create_cache.py`.

## Rust tests

Run from the repo root:

```
cargo test                              # in-repo crate tests
cargo test --manifest-path src/rust/Cargo.toml -- some::module::tests
```

Tests live alongside source as `#[cfg(test)] mod tests { ... }` blocks
and under `src/rust/tests/`.

For upstream `librustzcash` crates, clone that repo and run its own
test suite; many cryptographic invariants are tested there, not here.

## Benchmarks

`src/bench/` (built as `bench_bitcoin`) contains microbenchmarks for
hashes, signature verification, mempool insertion, coin selection,
etc. Run:

```
src/bench/bench_bitcoin
src/bench/bench_bitcoin -filter=Sapling*
```

Use these for performance regression checks before merging.

## Fuzzing

`src/fuzzing/` contains fuzz targets. There are two drivers:

- AFL (`zcutil/afl/`) for traditional coverage-guided fuzzing.
- libFuzzer (`zcutil/libfuzzer/`) for in-process fuzzing with
  Clang/sanitizers.

Both run against the same harnesses. Active targets: deserialisation of
blocks, transactions, scripts, addresses. The fuzzers are not run in CI
by default; ZODL should put them on a regular schedule.

## Cross-implementation differential testing

For consensus, the strongest test is "do zcashd and zebra agree on every
block from genesis to tip?". ECC historically ran this as a one-off
check before releases. The mechanism is to point both nodes at the same
testnet/mainnet and diff their `getblockchaininfo`/`getblock` outputs
per block. The Zcash Foundation has tooling for this; coordinate with
them before releasing a consensus-affecting change.

## What CI runs

`.github/workflows/` contains the GitHub Actions definitions. Roughly:

- `build` on Debian/Ubuntu, with all the depends.
- `test_bitcoin`, `zcash-gtest`, the RPC test suite.
- Rust tests via `cargo test`.
- Lint of source files (whitespace, header guards).

CI does *not* run fuzzers, does not run benchmarks, does not run
cross-implementation diff tests. Plan to backfill these on a periodic
schedule (nightly, weekly).

## Debugging tests

For a flaky RPC test, the most useful flag is:

```
qa/pull-tester/rpc-tests.py --nocleanup mempool_nu_activation.py
```

`--nocleanup` leaves the per-test data directories under
`/tmp/test...` so you can inspect `debug.log`, `wallet.dat`, etc.

For a failing gtest, run with `--gtest_break_on_failure` under `gdb`
to drop into the debugger at the assertion site.

For a Rust failure, `RUST_BACKTRACE=1 cargo test --release` and read
the panic location.
