# -*- coding: utf-8 -*-
"""生成英语音频.py — 16_保研英语面试 内置音频一次性构建脚本

把 en-interview-data.js 里每条英文文本(自我介绍/问答/救场金句/专业词汇/例句)
用微软 AriaNeural(与 Edge「标准音色」同款引擎,经 edge-tts)预生成为 MP3,
存 _assets/en-audio/,并产出清单 _assets/en-audio-map.js(原文 → 文件路径)。
页面点击播放 = 播本地音频文件,毫秒级起播、离线可用,不再依赖浏览器实时 TTS;
TTS 仅作兜底(生词本自加的词、清单未覆盖的新内容)。

用法:  python _本地工具/生成英语音频.py          (幂等,已生成的文件自动跳过)
依赖:  python -c "import edge_tts" 缺失则先 pip install edge-tts
"""
import asyncio
import hashlib
import json
import os
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(ROOT, "_assets", "en-interview-data.js")
NOTES_JS = os.path.join(ROOT, "_assets", "en-notes.js")
OUT_DIR = os.path.join(ROOT, "_assets", "en-audio")
MAP_JS = os.path.join(ROOT, "_assets", "en-audio-map.js")
VOICE = "en-US-AriaNeural"          # Edge 默认美音,即页面「标准音色」的同款
CONCURRENCY = 6
RETRIES = 3

# 与页面 TTS.normalize 同一份缩写表:合成前替换,清单的键仍是原文
ABBR = {
    "ROS": "R O S", "AI": "A I", "PCB": "P C B", "ESC": "E S C", "ADC": "A D C",
    "FFT": "F F T", "GPA": "G P A", "PWM": "P W M", "PID": "P I D", "PhD": "P h D",
    "STM32": "S T M thirty two", "Hz": "hertz",
}

def normalize(text):
    out = text
    for k, v in ABBR.items():
        out = re.sub(r"\b" + re.escape(k) + r"\b", v, out)
    return out

def dump_texts():
    """node 执行数据文件拿 EN_DATA/EN_NOTES:产出全部英文语句(精确键)与唯一单词(小写键,词级发音)。
    V2.1.28 语料补齐(此前词组/单字母/连字符半词点击会回落 TTS 网络音色,听感"无反应"):
    ① 单词切分与页面 wrapWords 同一把刀(连字符不算词符),并把 multi-layer 拆成 multi+layer 两键;
    ② 单字母(a/I/P/D…)也生成——页面句中可点、弹窗可读;
    ③ en-notes.js 的词组短语(页面 en-ph 整块朗读)与语法/词根键并入语料。"""
    js = r"""
global.window = {};
require(process.argv[1]);
require(process.argv[2]);
var D = window.EN_DATA, NOTES = window.EN_NOTES || {};
var texts = [], words = {}, i, j, g, m, k;
function push(t){ if(t && texts.indexOf(t) < 0) texts.push(t); }
for(i = 0; i < D.intro.length; i++) for(j = 0; j < D.intro[i].lines.length; j++) push(D.intro[i].lines[j].en);
for(i = 0; i < D.qa.length; i++){ push(D.qa[i].q); for(j = 0; j < D.qa[i].lines.length; j++) push(D.qa[i].lines[j].en); }
for(i = 0; i < D.rescue.length; i++) push(D.rescue[i].en);
for(g = 0; g < D.vocab.length; g++) for(i = 0; i < D.vocab[g].words.length; i++){ push(D.vocab[g].words[i].w); push(D.vocab[g].words[i].ex); }
var re = /[A-Za-z][A-Za-z'\u2019-]*/g;
for(i = 0; i < texts.length; i++){
  while((m = re.exec(texts[i]))){
    var parts = m[0].split('-');
    for(k = 0; k < parts.length; k++){
      var w = parts[k].toLowerCase().replace(/^[-']+|[-']+$/g, '');
      if(w) words[w] = 1;
    }
  }
}
['phrases', 'grammar', 'roots'].forEach(function(sec){
  var obj = NOTES[sec] || {};
  for(var key in obj) if(obj.hasOwnProperty(key) && /^[a-z][a-z' ]*$/i.test(key)) words[key.toLowerCase()] = 1;
});
console.log(JSON.stringify({ texts: texts, words: Object.keys(words) }));
"""
    out = subprocess.check_output(["node", "-e", js, DATA_JS, NOTES_JS], cwd=ROOT)
    d = json.loads(out.decode("utf-8"))
    return d["texts"], d["words"]

def fname(text):
    return "en-audio/" + hashlib.md5(text.encode("utf-8")).hexdigest()[:12] + ".mp3"

async def gen_one(sem, spoken, path, failed):
    """spoken:待合成的原文(内部做缩写替换);失败时把 path 记入 failed"""
    async with sem:
        for attempt in range(1, RETRIES + 1):
            try:
                import edge_tts
                c = edge_tts.Communicate(normalize(spoken), voice=VOICE)
                await c.save(path)
                if os.path.getsize(path) > 500:
                    return
            except Exception as e:
                if attempt == RETRIES:
                    failed.append(path)
                    print("  FAIL %s: %s" % (os.path.basename(path), repr(e)))
                else:
                    await asyncio.sleep(1.5 * attempt)

async def main():
    try:
        import edge_tts  # noqa: F401
    except ImportError:
        print("缺少 edge-tts:请先执行  pip install edge-tts")
        return 2
    texts, words = dump_texts()
    os.makedirs(OUT_DIR, exist_ok=True)

    # 语句用原文做键(页面按整句精确查找);单词统一小写做键(页面查不到原样时落小写),
    # 两类键在同一清单共存——语句含空格标点,与单词键天然不冲突
    todo, manifest = [], {}
    all_items = [(t, t) for t in texts] + [(w, w) for w in words]
    for key, spoken_src in all_items:
        rel = fname(key)
        p = os.path.join(ROOT, "_assets", rel)
        if os.path.exists(p) and os.path.getsize(p) > 500:
            manifest[key] = rel
        else:
            todo.append((key, p, rel, spoken_src))
    print("texts=%d, words=%d, cached=%d, to-generate=%d" % (len(texts), len(words), len(all_items) - len(todo), len(todo)))

    sem = asyncio.Semaphore(CONCURRENCY)
    failed = []
    done = [0]
    def report(fut):
        done[0] += 1
        if done[0] % 20 == 0 or done[0] == len(todo):
            print("  progress %d/%d" % (done[0], len(todo)))
    if todo:
        tasks = [asyncio.ensure_future(gen_one(sem, spoken, p, failed)) for key, p, rel, spoken in todo]
        for f in tasks:
            f.add_done_callback(report)
        await asyncio.gather(*tasks)

    # 只把生成成功的写进清单
    for key, p, rel, spoken in todo:
        if p not in failed and os.path.exists(p) and os.path.getsize(p) > 500:
            manifest[key] = rel
    for t in list(manifest):
        rel = manifest[t]
        p = os.path.join(ROOT, "_assets", rel)
        if not os.path.exists(p) or os.path.getsize(p) <= 500:
            del manifest[t]

    # 清掉数据里已不引用的孤儿文件
    keep = set(manifest.values())
    removed = 0
    for name in os.listdir(OUT_DIR):
        if name.endswith(".mp3") and ("en-audio/" + name) not in keep:
            os.remove(os.path.join(OUT_DIR, name))
            removed += 1

    total = sum(os.path.getsize(os.path.join(ROOT, "_assets", r)) for r in keep)
    with open(MAP_JS, "w", encoding="utf-8", newline="\n") as f:
        f.write("/* en-audio-map.js — 16_保研英语面试 内置音频清单(原文 → MP3 路径,相对 _assets/)\n")
        f.write(" * 由 _本地工具/生成英语音频.py 生成,勿手改;内容改动后重跑该脚本增量补齐 */\n")
        f.write("window.EN_AUDIO_MAP = " + json.dumps(manifest, ensure_ascii=False, sort_keys=True) + ";\n")
    print("manifest=%d entries, %.2f MB, pruned=%d, failed=%d" % (len(manifest), total / 1048576.0, removed, len(failed)))
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
