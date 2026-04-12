/**
小红拿到了一个数列，数列满足以下性质：a_{1}=1,a_{2}=2，从第三项开始，a_{i}=a_{[i/3]}+a_{[i*2/3]}
现在给定n，请你求出该数列的前n项。
a_{\lfloor i/3\rfloor} 表示"i/3"的向下取整。

一个正整数n
1\leq n \leq 200000

输入例子：
5
输出例子：
1 2 3 3 4
例子说明：
a_1=1
a_2=2
a_3=a_1+a_2=3
a_4=a_1+a_2=3
a_5=a_1+a_3=4
 */

#include <iostream>
#include <vector>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    vector<long long> a(n + 1);
    a[1] = 1;
    if (n >= 2) a[2] = 2;

    for (int i = 3; i <= n; ++i) {
        a[i] = a[i / 3] + a[(2 * i) / 3];
    }

    for (int i = 1; i <= n; ++i) {
        if (i > 1) cout << ' ';
        cout << a[i];
    }
    cout << '\n';
    return 0;
}
