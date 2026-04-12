/**
 * 信息增益比：对每个特征列计算 GainRatio(A) = (H(D) - H(D|A)) / H_IV(A)，
 * 其中 H_IV(A) 为按该特征取值划分的“分裂信息熵”（各分片占比的熵）。
 * 数据矩阵最后一列为类别，其余列为特征。输出增益比最大的特征下标（相等取最小下标）。
 *
 * 输入：可为 JSON 二维数组，或首行两个整数 n m 后跟 n*m 个整数（行优先）。
 */

#include <cmath>
#include <iostream>
#include <map>
#include <string>
#include <vector>

using namespace std;

static double entropy_from_counts(const vector<int>& cnt, int total) {
    if (total <= 0) return 0.0;
    double h = 0.0;
    for (int c : cnt) {
        if (c <= 0) continue;
        double p = static_cast<double>(c) / total;
        h -= p * (log(p) / log(2.0));
    }
    return h;
}

/** 一列类别标签上的熵 H(D)，类别取值 0..K-1 或任意整型用 map 计数 */
static double entropy_labels(const vector<int>& labels) {
    map<int, int> mp;
    for (int y : labels) ++mp[y];
    vector<int> cnt;
    for (auto& e : mp) cnt.push_back(e.second);
    return entropy_from_counts(cnt, static_cast<int>(labels.size()));
}

static void extract_ints(const string& s, vector<int>& out) {
    out.clear();
    size_t i = 0;
    const size_t n = s.size();
    while (i < n) {
        while (i < n && (s[i] < '0' || s[i] > '9') && s[i] != '-') ++i;
        if (i >= n) break;
        long long v = 0;
        bool neg = false;
        if (s[i] == '-') {
            neg = true;
            ++i;
        }
        while (i < n && s[i] >= '0' && s[i] <= '9') {
            v = v * 10 + (s[i] - '0');
            ++i;
        }
        out.push_back(static_cast<int>(neg ? -v : v));
    }
}

static bool parse_matrix(istream& in, vector<vector<int>>& mat) {
    string s((istreambuf_iterator<char>(in)), istreambuf_iterator<char>());
    size_t p = 0;
    while (p < s.size() && (s[p] == ' ' || s[p] == '\t' || s[p] == '\r' || s[p] == '\n'))
        ++p;
    vector<int> flat;
    extract_ints(s, flat);
    if (flat.empty()) return false;

    if (p < s.size() && s[p] == '[') {
        int rows = 1;
        for (size_t i = 0; i + 1 < s.size(); ++i) {
            if (s[i] == ']' && s[i + 1] == ',') ++rows;
        }
        int m = static_cast<int>(flat.size()) / rows;
        if (rows <= 0 || m <= 0 || rows * m != static_cast<int>(flat.size())) return false;
        mat.assign(rows, vector<int>(m));
        for (int r = 0; r < rows; ++r)
            for (int c = 0; c < m; ++c) mat[r][c] = flat[r * m + c];
        return true;
    }

    if (flat.size() < 3) return false;
    int rows = flat[0];
    int cols = flat[1];
    if (rows <= 0 || cols <= 0) return false;
    if (2 + static_cast<size_t>(rows) * cols != flat.size()) return false;
    mat.assign(rows, vector<int>(cols));
    size_t t = 2;
    for (int r = 0; r < rows; ++r)
        for (int c = 0; c < cols; ++c) mat[r][c] = flat[t++];
    return true;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    vector<vector<int>> mat;
    if (!parse_matrix(cin, mat) || mat.empty()) return 0;

    const int n = static_cast<int>(mat.size());
    const int m = static_cast<int>(mat[0].size());
    if (m < 2) {
        cout << 0 << '\n';
        return 0;
    }

    vector<int> labels(n);
    for (int i = 0; i < n; ++i) labels[i] = mat[i][m - 1];

    const double HD = entropy_labels(labels);

    int best_j = 0;
    double best_ratio = -1.0;

    for (int j = 0; j < m - 1; ++j) {
        map<int, vector<int>> parts;
        for (int i = 0; i < n; ++i) parts[mat[i][j]].push_back(labels[i]);

        double H_DA = 0.0;
        double H_IV = 0.0;

        for (auto& e : parts) {
            const vector<int>& labs = e.second;
            int sz = static_cast<int>(labs.size());
            double w = static_cast<double>(sz) / n;
            map<int, int> cc;
            for (int y : labs) ++cc[y];
            vector<int> cnt;
            for (auto& kv : cc) cnt.push_back(kv.second);
            H_DA += w * entropy_from_counts(cnt, sz);
            H_IV -= w * (log(w) / log(2.0));
        }

        double gain = HD - H_DA;
        double ratio = 0.0;
        if (H_IV > 1e-15) ratio = gain / H_IV;
        if (ratio > best_ratio + 1e-15
            || (fabs(ratio - best_ratio) <= 1e-15 && j < best_j)) {
            best_ratio = ratio;
            best_j = j;
        }
    }

    cout << best_j << '\n';
    return 0;
}
