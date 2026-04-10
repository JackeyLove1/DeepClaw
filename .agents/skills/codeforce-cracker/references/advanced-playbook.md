# Advanced Playbook

Use this file when the main workflow identifies the problem as hard but the winning abstraction is still unclear.

## Pattern Signals

### Greedy plus proof

Signals:

- local choice appears irreversible
- sorted order exposes a dominance relation
- only nearest or extreme elements matter
- feasibility improves when a threshold increases

Proof tools:

- exchange argument
- stays-ahead argument
- cut argument
- potential function

### Contribution counting

Signals:

- objective is a sum over all subarrays, pairs, paths, or choices
- direct construction is messy but each element's influence is simple
- sorting or prefix statistics turn global counting local

Typical moves:

- count how many times each element is maximum, minimum, left endpoint, right endpoint, or first bad position
- replace nested loops with prefix sums, Fenwick tree, or combinatorial counting

### Dynamic programming

Signals:

- sequential decisions with a compact frontier
- partition points or transitions over ordered positions
- optimal substructure becomes obvious after sorting or compression

Questions:

- what is the minimal state that preserves future legality
- can the transition be written as min over previous states plus a separable term
- can monotonicity enable divide-and-conquer, convex hull trick, or monotone queue optimization

### Graph transformation

Signals:

- dependencies between operations
- reachability under rules
- cycle handling determines feasibility
- constraints compare pairs of objects

Try:

- build implication graph
- contract SCCs
- turn constraints into edges in a DAG
- look for shortest path with reweighting or 0-1 BFS
- interpret states as graph nodes only if the expansion remains bounded

### Tree techniques

Signals:

- repeated subtree queries
- rerooting or all-roots answers
- path constraints mixed with subtree aggregation

Try:

- Euler tour flattening
- reroot DP
- small-to-large merging
- binary lifting
- heavy-light decomposition only if simpler tools fail

### Offline query processing

Signals:

- updates and queries interact awkwardly online
- answer depends on relative order rather than real time
- sorting by one coordinate makes the second coordinate manageable

Try:

- sort queries by threshold and add events incrementally
- sweep line with Fenwick or segment tree
- Mo's algorithm only when add and remove are truly cheap

### Bitwise and algebraic structure

Signals:

- XOR, basis, parity, subset closure, or power-of-two behavior
- constraints look impossible in value space but linear in bit space

Try:

- linear basis over XOR
- bit contribution independence
- SOS DP or subset transforms when dimension is small enough

### Strings

Signals:

- repeated substring comparisons
- prefix or suffix border structure
- transitions depend on longest matched prefix

Try:

- prefix-function or Z-function for border logic
- rolling hash only when deterministic tools are awkward
- suffix automaton or suffix array only when the state space justifies it

## Stuck Moves

If the task still does not open up:

1. Write a brute force for `n <= 8` mentally and inspect what it is actually comparing.
2. Ask what a certificate of optimality would look like.
3. Ask what must be true in the final answer rather than how to build it.
4. Prove a forbidden configuration and use it to reduce the search space.
5. Split the problem by the last operation, highest bit, leftmost violation, or first differing index.
6. Search for a monotone answer parameter and test whether feasibility is easier than optimization.

## Proof Skeleton

Use this template when the idea is right but the justification is not yet sharp:

1. Define the maintained invariant or canonical form.
2. Show initialization is valid.
3. Show each step preserves the invariant.
4. Show any optimal or valid answer can be transformed into the algorithm's form without worsening it.
5. Conclude optimality or correctness.

For constructive problems:

1. Show every produced operation is legal.
2. Show progress is monotone and termination is guaranteed.
3. Show the terminal state satisfies all requirements.

## Implementation Checklist

- compress values if indices matter more than magnitudes
- convert recursive DFS to iterative if depth can hit limits
- clear per-test-case containers
- use `long long` or wider when counting pairs or subarrays
- size segment trees and Fenwick trees explicitly
- guard one-based versus zero-based indexing
- separate preprocessing, solve, and output phases cleanly

## Response Standard

For final answers, prefer concise editorial style:

- one paragraph for the key idea
- one paragraph for why it is correct
- complexity in one line
- one complete implementation
