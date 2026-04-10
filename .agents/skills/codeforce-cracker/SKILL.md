---
name: codeforce-cracker
description: Solve hard Codeforces and similar competitive-programming problems, especially Codeforces 2200+ rating tasks that require nontrivial invariants, proofs, data structures, greedy arguments, dynamic programming, or constructive reasoning. Use when the user shares a difficult problem statement, asks for an editorial-style derivation, wants a contest-ready implementation, or needs help debugging a near-final solution.
---

# Codeforce Cracker

Produce a solution the way a strong competitive programmer would: derive structure first, prove it, then implement the smallest correct algorithm.

## Core Workflow

### 1. Normalize the task

- Restate the input, output, and optimization target in plain language.
- Extract the real constraints and immediately infer the required complexity class.
- List the quantities that can change and the quantities that are invariant.
- Decide whether the task is asking for:
  - existence
  - construction
  - optimization
  - counting
  - online queries

### 2. Mine structure before coding

- Work through tiny hand-made examples and extreme cases.
- Search for monotonicity, exchange arguments, parity, prefix or suffix behavior, and conserved quantities.
- Ask which representation makes the structure obvious:
  - sorted order
  - graph or DAG
  - tree
  - intervals
  - prefix sums
  - contributions per element
  - DP state machine
  - offline query order
- If a brute-force process is easy to define, use it to discover the hidden rule, then compress that rule into an efficient algorithm.

### 3. Commit to one idea only after a proof sketch exists

Before writing code, state:

1. The candidate algorithm.
2. The key lemma or invariant.
3. Why the algorithm never misses the optimum or valid construction.
4. The exact time and memory complexity.

If any of these are fuzzy, keep searching. For 2200+ tasks, coding before the proof usually wastes time.

### 4. Implement conservatively

- Default to `C++17` for final contest-ready code unless the user asked for another language.
- Keep the implementation aligned with the proof. Every variable should correspond to something justified in the reasoning.
- Prefer straightforward loops and data structures over clever syntax.
- Isolate tricky transitions, case splits, or data-structure updates with short comments.
- Avoid hidden constant-factor traps when the limits are tight.

### 5. Verify like an adversary

Check:

- smallest input
- largest input shape
- duplicated values
- already-sorted and reverse-sorted cases
- all-equal cases
- impossible cases
- off-by-one boundaries
- integer overflow
- stale state across test cases

Run a dry simulation on one nontrivial sample after the code is written.

## Escalation Rules

If the first idea stalls, try these in order:

1. Solve a restricted version and identify what extra freedom breaks it.
2. Reverse the process and describe when an operation could have been the last move.
3. Replace element-wise reasoning with contribution counting.
4. Sort objects and ask whether only adjacent interactions matter.
5. Turn optimization into feasibility plus binary search only if the checker is genuinely simpler.
6. Move from online to offline order.
7. Compress values, states, or events.
8. Recast the task as graph reachability, shortest path, matching, topological order, or SCC condensation.

## Output Format

When solving a problem, produce:

1. A short restatement.
2. The key observation or invariant.
3. The algorithm.
4. A proof sketch.
5. Complexity.
6. Final code.

If the user explicitly asks for hints only, stop before the full solution and reveal the idea gradually.

## Reference

Read [references/advanced-playbook.md](references/advanced-playbook.md) when:

- the problem still feels under-classified after the first pass
- the likely family is advanced DP, graphs, strings, bitwise algebra, or offline data structures
- the proof is shaky and needs a stronger template
- the implementation is correct in spirit but fragile in details
