# -*- coding: utf-8 -*-
"""
生成全站 favicon / PWA 图标(机器人头 · 绯白配色正式版)
造型:白色圆润机器人头 + 深色面罩 + 发光双眼 + 侧耳
配色:绯红渐变底 + 白头白眼(青色高光),耳朵淡粉半透明,与青点缀互补协调
内置配色(备选保留,可一键重出):
  crimson(默认,正式) / deepsea(7 深海) / ink-earless(2 墨青无耳)
用法:
  python make_favicon.py                     # 正式全套:favicon.ico + favicon.svg + _assets 全部图标
  python make_favicon.py --official deepsea  # 换配色重新生成正式全套
  python make_favicon.py --keep deepsea 深海  # 仅输出 512px 备选图到 _本地工具/备选图标/
小尺寸优化:16/32px 用 small 变体(去耳朵/去辉光/加粗眼睛),避免糊
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

N = 1024
U = N / 128.0

def u(*vals):
    return [v * U for v in vals]

def grad_img(size, stops, diagonal=True):
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float64)
    t = (xs + ys) / (2 * (size - 1)) if diagonal else ys / (size - 1)
    t = np.clip(t, 0.0, 1.0)
    pos = [p for p, _ in stops]
    cols = np.array([c for _, c in stops], dtype=np.float64)
    out = np.zeros((size, size, 3), dtype=np.uint8)
    for ch in range(3):
        out[..., ch] = np.interp(t, pos, cols[:, ch]).astype(np.uint8)
    return Image.fromarray(out)

def rounded_mask(w, h, bbox, radius):
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle(bbox, radius=radius, fill=255)
    return m

def paste_grad(base, grad, bbox, radius):
    x0, y0, x1, y1 = [int(round(v)) for v in bbox]
    region = grad.crop((x0, y0, x1, y1)).convert("RGBA")
    mask = rounded_mask(region.width, region.height, (0, 0, region.width, region.height), radius)
    base.paste(region, (x0, y0), mask)

def hx(c):
    return "#%02X%02X%02X" % c

# ---- 内置配色 ----
PALETTES = {
    "crimson": dict(   # 5 绯白(正式):绯红渐变底 + 白头白眼
        tile=[(0.0, (225, 29, 72)), (0.55, (159, 18, 57)), (1.0, (76, 7, 32))],
        sheen=0.16, stroke=(255, 255, 255, 50), shadow=(60, 5, 20, 110),
        head=[(0.0, (255, 255, 255)), (1.0, (220, 226, 238))],
        visor=[(0.0, (10, 10, 15)), (1.0, (26, 26, 32))],
        eye=[(0.0, (255, 255, 255)), (1.0, (228, 228, 234))],
        ear=(255, 232, 236, 175), glow=(255, 255, 255, 140), ears=True,
    ),
    "deepsea": dict(   # 7 深海(备选):海军蓝渐变底 + 白头青眼
        tile=[(0.0, (48, 88, 205)), (0.55, (24, 55, 160)), (1.0, (10, 20, 72))],
        sheen=0.16, stroke=(255, 255, 255, 46), shadow=(4, 12, 40, 130),
        head=[(0.0, (255, 255, 255)), (1.0, (220, 226, 238))],
        visor=[(0.0, (10, 10, 15)), (1.0, (26, 26, 32))],
        eye=[(0.0, (125, 235, 255)), (1.0, (56, 189, 248))],
        ear=(170, 196, 235, 255), glow=(34, 211, 238, 200), ears=True,
    ),
    "ink-earless": dict(   # 2 墨青无耳(备选):墨黑渐变底 + 白头青眼、无侧耳
        tile=[(0.0, (32, 34, 40)), (0.55, (15, 16, 20)), (1.0, (5, 6, 9))],
        sheen=0.14, stroke=(255, 255, 255, 42), shadow=(8, 20, 46, 120),
        head=[(0.0, (255, 255, 255)), (1.0, (220, 226, 238))],
        visor=[(0.0, (10, 10, 15)), (1.0, (26, 26, 32))],
        eye=[(0.0, (125, 235, 255)), (1.0, (56, 189, 248))],
        ear=(168, 190, 220, 255), glow=(34, 211, 238, 210), ears=False,
    ),
}

HEAD_BOX = u(33, 36, 95, 94)
VISOR_BOX = u(42, 56, 86, 82)
EYE_X = (50, 70)

def render(pal, small=False):
    """small=True: 16/32px 专用——去耳朵/去辉光/去柔光描边,眼加粗,保小图不糊"""
    tile_r = 29 * U
    img = grad_img(N, pal["tile"])
    img.putalpha(rounded_mask(N, N, (0, 0, N, N), tile_r))
    canvas = img.convert("RGBA")

    if not small:
        h_clip = int(N * 0.52)   # 顶部柔光:上 52% 内线性衰减
        fade = np.zeros((N, N), dtype=np.float64)
        fade[:h_clip, :] = np.linspace(pal["sheen"], 0.0, h_clip)[:, None]
        tile_a = np.array(rounded_mask(N, N, (0, 0, N, N), tile_r), dtype=np.float64) / 255.0
        sh = Image.new("RGBA", (N, N), (255, 255, 255, 255))
        sh.putalpha(Image.fromarray((fade * tile_a * 255).astype(np.uint8)))
        canvas = Image.alpha_composite(canvas, sh)
        stroke = Image.new("RGBA", (N, N), (0, 0, 0, 0))   # 内描边
        sd = ImageDraw.Draw(stroke)
        inset = 2.2 * U
        sd.rounded_rectangle((inset, inset, N - inset, N - inset),
                             radius=tile_r - inset, outline=pal["stroke"], width=max(2, int(1.6 * U)))
        canvas = Image.alpha_composite(canvas, stroke)

    # 头部投影
    shadow = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    sdp = ImageDraw.Draw(shadow)
    sdp.rounded_rectangle([HEAD_BOX[0] + 2 * U, HEAD_BOX[1] + 7 * U, HEAD_BOX[2] + 2 * U, HEAD_BOX[3] + 7 * U],
                          radius=20 * U, fill=(*pal["shadow"][:3], 90 if small else pal["shadow"][3]))
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur((3 if small else 5) * U)))

    if not small and pal["ears"]:
        ears = Image.new("RGBA", (N, N), (0, 0, 0, 0))
        ed = ImageDraw.Draw(ears)
        for box in (u(25, 57, 35, 81), u(93, 57, 103, 81)):
            ed.rounded_rectangle(box, radius=5.5 * U, fill=pal["ear"])
        canvas = Image.alpha_composite(canvas, ears)

    head_grad = grad_img(N, pal["head"], diagonal=False)
    layer = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    paste_grad(layer, head_grad, HEAD_BOX, 20 * U)
    canvas = Image.alpha_composite(canvas, layer)

    visor_grad = grad_img(N, pal["visor"], diagonal=False)
    layer = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    paste_grad(layer, visor_grad, VISOR_BOX, 13 * U)
    canvas = Image.alpha_composite(canvas, layer)

    if not small:   # 眼睛辉光
        glow = Image.new("RGBA", (N, N), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        for x0 in EYE_X:
            gd.rounded_rectangle(u(x0 - 0.5, 59.5, x0 + 8.5, 78.5), radius=4 * U, fill=pal["glow"])
        canvas = Image.alpha_composite(canvas, glow.filter(ImageFilter.GaussianBlur(2.4 * U)))

    eye_grad = grad_img(N, pal["eye"], diagonal=False)
    layer = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    w = 9 if small else 8
    for x0 in EYE_X:
        cx = x0 + 4
        paste_grad(layer, eye_grad, u(cx - w / 2, 61, cx + w / 2, 77), 4 * U)
    canvas = Image.alpha_composite(canvas, layer)
    return canvas

def svg_text(pal):
    """与位图同几何的 SVG(小尺寸优化在浏览器里由矢量缩放天然保证)"""
    stops = lambda ss, opacity="": "".join(
        f'<stop offset="{p}" stop-color="{hx(c)}"{opacity}/>' for p, c in ss)
    ear = ""
    if pal["ears"]:
        ec, ea = pal["ear"][:3], pal["ear"][3]
        ear = (f'<rect x="25" y="57" width="10" height="24" rx="5.5" fill="{hx(ec)}" opacity="{ea / 255:.2f}"/>'
               f'<rect x="93" y="57" width="10" height="24" rx="5.5" fill="{hx(ec)}" opacity="{ea / 255:.2f}"/>')
    sc, sa = pal["stroke"][:3], pal["stroke"][3]
    gc, ga = pal["glow"][:3], pal["glow"][3]
    scb, sb = pal["shadow"][:3], pal["shadow"][3] / 255
    ts = pal["tile"]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <!-- 人形机器人学习站 · 站点图标(由 _本地工具/make_favicon.py 同步生成,请勿手改) -->
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">{stops(ts)}</linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="{pal['sheen']}"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="head" x1="0" y1="0" x2="0" y2="1">{stops(pal['head'])}</linearGradient>
    <linearGradient id="visor" x1="0" y1="0" x2="0" y2="1">{stops(pal['visor'])}</linearGradient>
    <linearGradient id="eye" x1="0" y1="0" x2="0" y2="1">{stops(pal['eye'])}</linearGradient>
    <clipPath id="tc"><rect width="128" height="128" rx="29"/></clipPath>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.4"/></filter>
  </defs>
  <rect width="128" height="128" rx="29" fill="url(#tile)"/>
  <g clip-path="url(#tc)">
    <rect width="128" height="67" fill="url(#sheen)"/>
    <rect x="35" y="43" width="62" height="58" rx="20" fill="{hx(scb)}" opacity="{sb:.2f}" filter="url(#soft)"/>
    {ear}
    <rect x="33" y="36" width="62" height="58" rx="20" fill="url(#head)"/>
    <rect x="42" y="56" width="44" height="26" rx="13" fill="url(#visor)"/>
    <rect x="49.5" y="59.5" width="9" height="19" rx="4" fill="{hx(gc)}" opacity="{ga / 255:.2f}" filter="url(#glow)"/>
    <rect x="69.5" y="59.5" width="9" height="19" rx="4" fill="{hx(gc)}" opacity="{ga / 255:.2f}" filter="url(#glow)"/>
    <rect x="50" y="61" width="8" height="16" rx="4" fill="url(#eye)"/>
    <rect x="70" y="61" width="8" height="16" rx="4" fill="url(#eye)"/>
  </g>
  <rect x="2.2" y="2.2" width="123.6" height="123.6" rx="26.8" fill="none" stroke="{hx(sc)}" stroke-opacity="{sa / 255:.2f}" stroke-width="1.6"/>
</svg>
'''

root = r"D:\HuaweiMoveData\Users\亓剑清\Desktop\人形机器人关节模组"

def build_official(pal):
    full = render(pal, small=False)
    small = render(pal, small=True)
    full.resize((512, 512), Image.LANCZOS).save(root + r"\_assets\icon-512.png")
    full.resize((192, 192), Image.LANCZOS).save(root + r"\_assets\icon-192.png")
    full.resize((180, 180), Image.LANCZOS).save(root + r"\_assets\favicon-180.png")
    # 多尺寸 ICO:16/32 用 small 变体;Pillow 会跳过超过底图的尺寸,故底图用最大的 48
    frames = [small.resize((16, 16), Image.LANCZOS),
              small.resize((32, 32), Image.LANCZOS),
              full.resize((48, 48), Image.LANCZOS)]
    frames[2].save(root + r"\favicon.ico", format="ICO",
                   append_images=frames[:2], sizes=[(16, 16), (32, 32), (48, 48)])
    with open(root + r"\favicon.svg", "w", encoding="utf-8", newline="\n") as f:
        f.write(svg_text(pal))

def write_keeper(name, pal):
    import os
    outdir = root + r"\_本地工具\备选图标"
    os.makedirs(outdir, exist_ok=True)
    render(pal, small=False).resize((512, 512), Image.LANCZOS).save(f"{outdir}\\{name}.png")

if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "--keep":
        write_keeper(sys.argv[3], PALETTES[sys.argv[2]])
        print(f"keeper saved: {sys.argv[3]}")
    else:
        pal_name = sys.argv[sys.argv.index("--official") + 1] if "--official" in sys.argv else "crimson"
        build_official(PALETTES[pal_name])
        print(f"official icons rebuilt: {pal_name}")
