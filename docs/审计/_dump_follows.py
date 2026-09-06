# -*- coding: utf-8 -*-
"""临时工具:导出 ib-data-x.js 每题的 follow 追问(整文件正则按 id 定位,兼容内联格式)"""
import io, re, sys

tag = sys.argv[1] if len(sys.argv) > 1 else 'a'
s = io.open('_assets/ib-data-%s.js' % tag, encoding='utf-8').read()
out = []
for m in re.finditer(r"\{ id:'([a-z]+-\d+)'.*?follow:\[(.*?)\]", s, re.S):
    qs = re.findall(r"'((?:[^'\\]|\\.)*)'", m.group(2))
    out.append(m.group(1) + ' | ' + ' || '.join(qs))
print('\n'.join(out))
print('TOTAL', len(out))
