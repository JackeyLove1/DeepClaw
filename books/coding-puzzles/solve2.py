from typing import List


class Solution:
    def numberOfEdgesAdded(self, n: int, edges: List[List[int]]) -> int:
        parent = list(range(n))
        rank = [0] * n
        xor = [0] * n  # parity to root

        def find(x):
            if parent[x] != x:
                root = find(parent[x])
                xor[x] ^= xor[parent[x]]
                parent[x] = root
            return parent[x]

        ans = 0
        for u, v, w in edges:
            ru, rv = find(u), find(v)
            pu, pv = xor[u], xor[v]
            if ru == rv:
                # same component: accept if existing path parity matches w
                if (pu ^ pv) == w:
                    ans += 1
            else:
                # different components: always merge
                if rank[ru] < rank[rv]:
                    ru, rv = rv, ru
                    pu, pv = pv, pu
                parent[rv] = ru
                xor[rv] = pu ^ pv ^ w
                if rank[ru] == rank[rv]:
                    rank[ru] += 1
                ans += 1
        return ans


if __name__ == "__main__":
    print(Solution().numberOfEdgesAdded(3, [[0,1,1],[1,2,1],[0,2,1]]))  # 2
