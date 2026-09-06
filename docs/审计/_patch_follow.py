# -*- coding: utf-8 -*-
"""临时工具:把 ib-data-x.js 的 follow:['q','q'] 升级为 follow:[{q,a},...]。
用法: python _patch_follow.py <a|b|c|d> <answers.json>
answers.json: {"zkl-01": ["ans1","ans2"], ...} 顺序与原 follow 顺序一致。"""
import io, re, json, sys

tag, jf = sys.argv[1], sys.argv[2]
path = '_assets/ib-data-%s.js' % tag
s = io.open(path, encoding='utf-8', newline='').read()
ans = json.load(io.open(jf, encoding='utf-8'))

def scan_strings(seg):
    """返回 [(raw_span_start, raw_span_end)] — 单引号字符串的原文区间(含转义)"""
    out, i, n = [], 0, len(seg)
    while i < n:
        if seg[i] == "'":
            j = i + 1
            while j < n:
                if seg[j] == '\\':
                    j += 2
                    continue
                if seg[j] == "'":
                    break
                j += 1
            out.append((i + 1, j))
            i = j + 1
        else:
            i += 1
    return out

def find_array_end(s, start):
    """start 指向 follow:[ 之后的第一个字符,返回匹配 ] 的下标(字符串感知)"""
    i, inq, n = start, False, len(s)
    while i < n:
        c = s[i]
        if inq:
            if c == '\\':
                i += 2
                continue
            if c == "'":
                inq = False
        else:
            if c == "'":
                inq = True
            elif c == ']':
                return i
        i += 1
    return -1

def jstr(x):
    return "'" + x.replace('\\', '\\\\').replace("'", "\\'") + "'"

items = [(m.start(), m.group(1)) for m in re.finditer(r"\{ id:'([a-z]+-\d+)'", s)]
pos = {iid: st for st, iid in items}
order = [iid for _, iid in items]

cnt, miss = 0, []
for iid, answers in ans.items():
    if iid not in pos:
        miss.append(iid + ':no-id')
        continue
    st = pos[iid]
    nxt = min([p for p, i2 in items if p > st], default=len(s))
    fst = s.find('follow:[', st, nxt)
    if fst < 0:
        miss.append(iid + ':no-follow')
        continue
    a_st = fst + len('follow:[')
    a_ed = find_array_end(s, a_st)
    if a_ed < 0:
        miss.append(iid + ':bad-array')
        continue
    body = s[a_st:a_ed]
    spans = scan_strings(body)
    qs = [body[a:b] for a, b in spans]  # 原文(含既有转义,直接回填)
    if len(qs) != len(answers):
        miss.append('%s:count %d vs %d' % (iid, len(qs), len(answers)))
        continue
    new_body = ','.join('{q:' + jstr(q) + ',a:' + jstr(a) + '}' for q, a in zip(qs, answers))
    s = s[:a_st] + new_body + s[a_ed:]
    shift = len(new_body) - len(body)
    items = [(p + (shift if p > st else 0), i2) for p, i2 in items]
    pos = {i2: p for p, i2 in items}
    cnt += 1

io.open(path, 'w', encoding='utf-8', newline='').write(s)
print('patched %s: %d/%d  miss=%s' % (tag, cnt, len(ans), miss or 'none'))
