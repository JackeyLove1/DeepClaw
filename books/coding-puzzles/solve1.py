class Solution:
    def minOperations(self, nums: list[int], k: int) -> int:
        n = len(nums)
        if n < 2:
            return -1 if k > 0 else 0
        if k > n // 2:
            return -1

        # cost[i] = min increments to make index i a peak
        cost = [0] * n
        for i in range(n):
            left = nums[(i - 1) % n]
            right = nums[(i + 1) % n]
            cost[i] = max(0, max(left, right) + 1 - nums[i])

        INF = float('inf')

        def dp_pick(arr, want):
            """Pick exactly `want` non-adjacent items from arr, minimize sum."""
            if want == 0:
                return 0
            m = len(arr)
            if want > (m + 1) // 2:
                return INF
            # rolling dp: dp_prev2 = dp[i-2], dp_prev1 = dp[i-1]
            dp_prev2 = [INF] * (want + 1)
            dp_prev1 = [INF] * (want + 1)
            dp_prev2[0] = 0
            dp_prev1[0] = 0

            for i in range(m):
                dp_curr = [INF] * (want + 1)
                dp_curr[0] = 0
                for j in range(1, min(i + 2, want) + 1):
                    # skip i
                    dp_curr[j] = dp_prev1[j]
                    # take i (requires non-adjacency)
                    if i >= 1:
                        if dp_prev2[j - 1] != INF:
                            dp_curr[j] = min(dp_curr[j], dp_prev2[j - 1] + arr[i])
                    else:
                        if j == 1:
                            dp_curr[j] = min(dp_curr[j], arr[0])
                dp_prev2, dp_prev1 = dp_prev1, dp_curr

            return dp_prev1[want]

        # Case 1: don't pick index 0 → solve on [1..n-1]
        res1 = dp_pick(cost[1:], k)

        # Case 2: pick index 0 → skip n-1 and 1, solve on [2..n-2] with k-1 picks
        res2 = INF
        if k >= 1:
            res2 = cost[0] + dp_pick(cost[2 : n - 1], k - 1)

        ans = min(res1, res2)
        return -1 if ans >= INF else ans
