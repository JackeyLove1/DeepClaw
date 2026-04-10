产生至少 K 个峰值的最少操作次数

如果下标 i 对应的值 严格大于 其相邻元素，则该下标是一个 峰值 ：

如果 i > 0，下标 i 的 前一个 相邻元素是 nums[i - 1]，否则是 nums[n - 1]。
如果 i < n - 1，下标 i 的 后一个 相邻元素是 nums[i + 1]，否则是 nums[0]。
你可以执行以下操作 任意 次数：

选择任意下标 i 并将 nums[i] 增加 1。
返回使数组包含 至少 k 个峰值所需的 最小 操作数。如果不可能，返回 -1

```python3
class Solution:
    def minOperations(self, nums: list[int], k: int) -> int:
        
```