#!/usr/bin/env node
/* 校验对比度.js — 文字/背景 WCAG 对比度静态审计(浅色+深色双主题)
 * 零依赖(只用 fs/path)。V2.1.28 全站审查轮新增(用户要求"自检文字颜色对比度")。
 *
 * 口径与边界(启发式,输出供人工裁决):
 *  - 最小 CSS 变量解析:按主题层收集 --var 定义后代入(00_3D解剖主页等 var() 页面可判);
 *  - @media 处理:print / prefers-color-scheme 块整体丢弃(非本站双主题机制),
 *    其余 @media(hover 等)展开为普通规则;
 *  - 主题归属:html[data-theme-early='light'] 与 html:not([data-theme-early="dark"])(全站
 *    统一写法)与 body[data-theme="light"] → 浅色层;正向 dark → 深色覆写层;无前缀 → 基线层;
 *  - 基线层规则:若同尾选择器在深色覆写层存在 → 深色下被架空,只按浅色评;
 *    若文件含深色覆写层(双主题页)→ 基线规则两主题都必须通过才合格(不过任一主题即报);
 *    单主题页 → 按文件自身无前缀 body 底评;
 *  - 配对:①块内 color × background(-color/-image);②仅 color × 当前主题页底;
 *    ③浅色/基线层只写 color 时继承同尾基线规则的背景(渐变按当前主题页底合成 alpha 取均值);
 *  - WCAG 阈值:正文 ≥4.5,大字(≥24px,或 ≥18.66px 且 bold)≥3.0;
 *  - 已知边界:不模拟完整特异性/继承链,多重覆写场景可能误报,输出供人工裁决;
 *    SVG 内文字对比度由 svg_audit.js 负责(浅色字是 E 级),不在本脚本范围。
 * 用法:node _本地工具/校验对比度.js   (退出码:存在 <3.0 的配对时为 1)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'en-audio', 'docs', '_作品', '.agents', '.zcode', 'lib', 'models']);

/* ---------- 颜色解析 ---------- */
const NAMED = { white:'#ffffff', black:'#000000', red:'#ff0000', green:'#008000', blue:'#0000ff',
  orange:'#ffa500', yellow:'#ffff00', gray:'#808080', grey:'#808080', silver:'#c0c0c0', navy:'#000080' };

function parseColor(s){
  if(!s) return null;
  s = s.trim().toLowerCase();
  if(NAMED[s]) s = NAMED[s];
  let m = s.match(/^#([0-9a-f]{3})$/);
  if(m) return { r:parseInt(m[1][0]+m[1][0],16), g:parseInt(m[1][1]+m[1][1],16), b:parseInt(m[1][2]+m[1][2],16), a:1 };
  m = s.match(/^#([0-9a-f]{6})$/);
  if(m) return { r:parseInt(m[1].slice(0,2),16), g:parseInt(m[1].slice(2,4),16), b:parseInt(m[1].slice(4,6),16), a:1 };
  m = s.match(/^rgba?\(([^)]+)\)$/);
  if(m){
    const p = m[1].split(',').map(x=>parseFloat(x));
    if(p.length>=3 && p.every(x=>!isNaN(x))) return { r:p[0], g:p[1], b:p[2], a:p.length>3?(isNaN(p[3])?1:p[3]):1 };
  }
  return null;
}
function resolveVars(s, vars){
  if(!s || !vars || s.indexOf('var(')<0) return s;
  let out = s, guard = 0;
  while(out.indexOf('var(')>=0 && guard++<5){
    out = out.replace(/var\((--[\w-]+)\)/g, (all,name)=> (vars[name]!=null ? vars[name] : 'NOVAR'));
    if(out.indexOf('NOVAR')>=0) return null;
  }
  return out;
}
function isGradient(s){ return /gradient\(/i.test(s); }
function backdrop(top, base){
  if(!top) return null;
  if(top.a>=1) return top;
  const b = base || {r:0,g:0,b:0};
  return { r:Math.round(top.r*top.a+b.r*(1-top.a)), g:Math.round(top.g*top.a+b.g*(1-top.a)), b:Math.round(top.b*top.a+b.b*(1-top.a)), a:1 };
}
function lum(c){
  const f = v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
  return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);
}
function ratio(fg,bg){
  const L1=lum(fg), L2=lum(bg);
  return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
}
const fmt = c => c ? ('#'+[c.r,c.g,c.b].map(v=>('0'+v.toString(16)).slice(-2)).join('')) : '?';
const COLOR_TOK = /#[0-9a-fA-F]{3,6}|rgba?\([^)]+\)|var\(--[\w-]+\)/g;
function gradAvg(bgRaw, base, vars){
  const cols = (bgRaw.match(COLOR_TOK)||[]).map(t=>parseColor(resolveVars(t,vars))).filter(Boolean).map(c=>backdrop(c, base||null));
  if(!cols.length) return null;
  /* 按亮度取中位色:抗"聚光渐变"里孤立的浅色端(#fff 0% → 深底)拖偏均值 */
  const sorted = cols.slice().sort((a,b)=>lum(a)-lum(b));
  return sorted[Math.floor(sorted.length/2)];
}
function singleColor(bgRaw, vars){
  const resolved = resolveVars(bgRaw, vars);
  if(!resolved) return null;
  const cols = (resolved.match(COLOR_TOK) || []).map(parseColor).filter(Boolean);
  return cols.length ? cols[cols.length-1] : null;
}

/* ---------- @media 预处理 ---------- */
function stripAtBlocks(css){
  let out = '', i = 0;
  while(i < css.length){
    const at = css.indexOf('@media', i);
    if(at < 0){ out += css.slice(i); break; }
    out += css.slice(i, at);
    const open = css.indexOf('{', at);
    if(open < 0){ out += css.slice(at); break; }
    let depth = 1, j = open+1;
    while(j < css.length && depth > 0){
      if(css[j]==='{') depth++;
      else if(css[j]==='}') depth--;
      j++;
    }
    const inner = css.slice(open+1, j-1);
    if(!/print|prefers-color-scheme/i.test(css.slice(at, open))) out += inner;  /* hover 等展开,print/配色方案丢弃 */
    i = j;
  }
  return out;
}

/* ---------- 规则抽取 ---------- */
function extractRules(css, file, forLight){
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g; let m;
  while((m = re.exec(css))){
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g,'').trim();
    if(!sel || sel.charAt(0)==='@') continue;
    const body = m[2];
    const selNoNot = sel.replace(/:not\([^)]*\)/g,'');
    const isLight = /data-theme-early\s*=\s*['"]light['"]/.test(sel) ||
                    /:not\(\s*\[data-theme-early\s*=\s*['"]dark['"]\s*\]\s*\)/.test(sel) ||
                    /\[data-theme\s*=\s*['"]light['"]\]/.test(sel);
    const isDark  = /data-theme(-early)?\s*=\s*['"]dark['"]/.test(selNoNot);
    const theme = isLight ? 'light' : (isDark ? 'dark' : 'base');
    if(forLight && theme!=='light') continue;
    if(!forLight && theme==='light') continue;
    out.push({ file, sel, body, theme });
  }
  return out;
}
function decls(body){
  const d = {};
  body.split(';').forEach(kv=>{
    const i = kv.indexOf(':');
    if(i>0) d[kv.slice(0,i).trim().toLowerCase()] = kv.slice(i+1).trim();
  });
  return d;
}
function collectVars(rules){
  const m = {};
  rules.forEach(r=>{
    const d = decls(r.body);
    Object.keys(d).forEach(k=>{ if(k.charAt(0)==='-') m[k.trim()] = d[k]; });
  });
  return m;
}

/* ---------- 文件收集 ---------- */
function walk(dir, acc){
  let names; try{ names = fs.readdirSync(dir); }catch(e){ return acc; }
  for(const name of names){
    if(SKIP_DIRS.has(name)) continue;
    const p = path.join(dir,name);
    let st; try{ st = fs.statSync(p); }catch(e){ continue; }
    if(st.isDirectory()){ walk(p, acc); continue; }
    if(/\.html?$/i.test(name)) acc.push(p);
  }
  return acc;
}

/* ---------- 页底 ---------- */
const siteCss = stripAtBlocks(fs.readFileSync(path.join(ROOT,'_assets/site.css'),'utf8'));
const glassP = path.join(ROOT,'_assets/glass.css');
const glassCss = fs.existsSync(glassP) ? stripAtBlocks(fs.readFileSync(glassP,'utf8')) : '';
const baseRules = extractRules(siteCss, '_assets/site.css', false);
const lightRules = extractRules(siteCss, '_assets/site.css', true);
const GLOBAL_VARS = { d: collectVars(baseRules), l: collectVars(lightRules) };
function bodyBgOf(rules, vars){
  const r = rules.find(x=>/(^|[\s,])\s*body([\[.,:\s]|$)/.test(x.sel) && /background/.test(x.body));
  if(!r) return null;
  const d = decls(r.body);
  const bgRaw = (d['background']||'') + ';' + (d['background-image']||'');
  if(isGradient(bgRaw)) return gradAvg(bgRaw, null, vars);
  if(bgRaw.indexOf('var(')>=0 && !resolveVars(bgRaw, vars)) return null;
  return singleColor(bgRaw, vars);
}
const GLOBAL_PAGE = {
  dark: bodyBgOf(baseRules, GLOBAL_VARS.d) || { r:13,g:17,b:23,a:1 },
  light: bodyBgOf(lightRules, GLOBAL_VARS.l) || { r:246,g:248,b:251,a:1 }
};
function pageBgFor(fileRules, vBase, vDark, vLight){
  const p = {};
  p.base  = bodyBgOf(fileRules.filter(r=>r.theme==='base'),  vBase)  || GLOBAL_PAGE.dark;
  p.dark  = bodyBgOf(fileRules.filter(r=>r.theme==='dark'),  vDark)  || p.base;
  p.light = bodyBgOf(fileRules.filter(r=>r.theme==='light'), vLight) || GLOBAL_PAGE.light;
  return p;
}

/* ---------- 主流程 ---------- */
const findings = [];
function tailOf(sel){
  return sel.replace(/^(?:html:not\(\s*\[data-theme-early\s*=\s*['"]dark['"]\s*\]\s*\)|body\[data-theme\s*=\s*['"][a-z]+['"]\s*\]|html\[data-theme-early\s*=\s*['"][a-z]+['"]\s*\])\s*/,'').trim();
}
function bgKey(sel){ /* 背景继承键:剥伪类/伪类参数,允许向祖先回溯 */
  return tailOf(sel).replace(/:(hover|focus|active|visited|disabled|not\([^)]*\))/g,'').trim();
}
function bgLookup(map, tail){ /* 全尾 → 逐级去尾(祖先类) 回溯 */
  let k = bgKey(tail), guard = 0;
  while(k && guard++ < 4){
    if(map[k] != null) return map[k];
    const idx = k.lastIndexOf(' ');
    if(idx < 0) return map[k] != null ? map[k] : null;
    k = k.slice(0, idx);
  }
  return null;
}
/* 单条规则在指定主题下评测:返回 finding 或 null(通过/无法解析) */
function evalRule(r, theme, pageBg, vars, baseBgRaw){
  const d = decls(r.body);
  const fgRaw = d['color'];
  if(!fgRaw || fgRaw==='transparent') return null;
  const fg = singleColor(fgRaw, vars);
  if(!fg || isGradient(resolveVars(fgRaw, vars)||'')) return null;
  let bgRaw = d['background-color'] || d['background'] || d['background-image'] || '';
  let bg = null, mode = 'page';
  if(bgRaw && bgRaw!=='none' && bgRaw!=='transparent'){
    bg = isGradient(bgRaw) ? gradAvg(bgRaw, pageBg, vars) : singleColor(bgRaw, vars);
    if(bg) mode = 'grad';
    else if(!isGradient(bgRaw)) mode = 'page';
  }
  if(mode==='page' && !bgRaw){
    const spec = bgLookup(baseBgRaw, r.sel);
    if(spec){
      bg = isGradient(spec) ? gradAvg(spec, pageBg, vars) : singleColor(spec, vars);
      if(bg) mode = 'inherit';
    }
  }
  const bgEff = (mode!=='page' && bg) ? backdrop(bg, pageBg) : pageBg;
  const fgEff = backdrop(fg, bgEff);
  const fsz = parseFloat((d['font-size']||'').match(/^([\d.]+)px$/)||[0,0])[1];
  const bold = /bold|[6-9]00/.test(d['font-weight']||'');
  const large = fsz>=24 || (fsz>=18.66 && bold);
  const th = large ? 3.0 : 4.5;
  const cr = ratio(fgEff, bgEff);
  if(cr >= th) return null;
  return { sel: r.sel.slice(0,80), theme, fg: fmt(fgEff), bg: fmt(bgEff), mode, cr: Math.round(cr*100)/100, th };
}
function audit(css, file){
  const rulesL = extractRules(css, file, true);
  const rulesD = extractRules(css, file, false);
  /* 变量分层:基线(:root 等)为底,各主题覆写在上——页面可能"基线=浅色"(3D 主页),
     也可能"基线=深色"(site.css),不能跨层互串 */
  const varsBase = Object.assign({}, GLOBAL_VARS.d, collectVars(rulesD.filter(r=>r.theme==='base')));
  const varsDark = Object.assign({}, varsBase, collectVars(rulesD.filter(r=>r.theme==='dark')));
  const varsLight = Object.assign({}, varsBase, GLOBAL_VARS.l, collectVars(rulesL));
  const PAGE = pageBgFor(rulesD.concat(rulesL), varsBase, varsDark, varsLight);
  const hasDarkLayer = rulesD.some(r=>r.theme==='dark');
  /* 分组选择器(p,li{…})按逗号拆尾配对;先 trim 再剥主题前缀(续行带换行,^ 锚点要求先去空白) */
  const tailsOf = sel => sel.split(',').map(s => tailOf(s.trim()));
  const darkTails = new Set(rulesD.filter(r=>r.theme==='dark').flatMap(r=>tailsOf(r.sel)));
  const lightTails = new Set(rulesL.flatMap(r=>tailsOf(r.sel)));
  const baseBgRaw = {};
  rulesD.filter(r=>r.theme==='base').forEach(r=>{
    if(/:(hover|focus|active|visited)/.test(r.sel)) return;   /* 瞬态规则的背景不能当静态背景继承 */
    const d = decls(r.body);
    const spec = d['background-color'] || d['background'] || d['background-image'] || '';
    if(spec && spec!=='none' && spec!=='transparent') tailsOf(r.sel).forEach(t=>{ baseBgRaw[bgKey(t)] = spec; });
  });
  const lightBgRaw = {};
  rulesL.forEach(r=>{
    if(/:(hover|focus|active|visited)/.test(r.sel)) return;
    const d = decls(r.body);
    const spec = d['background-color'] || d['background'] || d['background-image'] || '';
    if(spec && spec!=='none' && spec!=='transparent') tailsOf(r.sel).forEach(t=>{ lightBgRaw[bgKey(t)] = spec; });
  });
  /* 浅色求值用:同层浅色背景优先,回退基线背景(基线可能是深色设计,直接借会误判) */
  const bgRawForLight = Object.assign({}, baseBgRaw, lightBgRaw);
  const push = (f, label) => findings.push(Object.assign({ file: path.relative(ROOT,file).replace(/\\/g,'/') }, f, { theme: label }));
  [[rulesD,'base'],[rulesL,'light']].forEach(([rules,layer])=>{
    rules.forEach(r=>{
      if(r.theme==='dark') return;              /* 深色覆写规则只用于 darkTails/变量,不参评 */
      const tail = tailOf(r.sel);
      if(layer==='base'){
        const parts = tailsOf(r.sel);
        const inDark = parts.some(t=>darkTails.has(t)), inLight = parts.some(t=>lightTails.has(t));
        if(inDark && inLight){ /* 两主题都有覆写,基线被完全架空 */ }
        else if(inDark){
          const f = evalRule(r, 'light', PAGE.light, varsLight, bgRawForLight);
          if(f) push(f, '浅色');
        }else if(inLight){
          const f = evalRule(r, 'dark', PAGE.dark, varsDark, baseBgRaw);
          if(f) push(f, '深色');
        }else if(hasDarkLayer){
          /* 双主题页的基线规则(无任何覆写):两主题都会真实渲染,任一不过即报 */
          const fD = evalRule(r, 'dark', PAGE.dark, varsDark, baseBgRaw);
          const fL = evalRule(r, 'light', PAGE.light, varsLight, bgRawForLight);
          if(fD && fL) push(fD.cr<=fL.cr ? fD : fL, '基线(两主题)');
          else if(fD) push(fD, '深色(基线缺深色覆写)');
          else if(fL) push(fL, '浅色(基线缺浅色覆写)');
        }else{
          const f = evalRule(r, 'dark', PAGE.base, varsBase, baseBgRaw);
          if(f) push(f, '深色');
        }
      }else{
        const f = evalRule(r, 'light', PAGE.light, varsLight, bgRawForLight);
        if(f) push(f, '浅色');
      }
    });
  });
}

audit(siteCss, path.join(ROOT,'_assets/site.css'));
if(glassCss) audit(glassCss, glassP);
walk(ROOT, []).forEach(f=>{
  try{
    const html = fs.readFileSync(f,'utf8');
    /* 同文件多个 <style> 块合并为一次审计:跨块的深色覆写/基线才能配对(减速器页等) */
    const styles = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi)||[])
      .map(s=>stripAtBlocks(s.replace(/<\/?style[^>]*>/gi,'')));
    if(styles.length) audit(styles.join('\n'), f);
  }catch(e){ /* 跳过不可读文件 */ }
});

/* ---------- 输出 ---------- */
findings.sort((a,b)=>a.cr-b.cr);
const fails = findings.filter(x=>x.cr<3.0), warns = findings.filter(x=>x.cr>=3.0);
console.log('==== 对比度审计(var 已解析, 双主题基线口径, 渐变按主题页底合成取均值) ====');
console.log('FAIL(<3.0): ' + fails.length + '  ·  WARN(3.0~4.5): ' + warns.length);
if(fails.length){
  console.log('\n---- FAIL 明细 ----');
  fails.forEach(x=>console.log('['+x.theme+'] ' + x.cr + ' (需≥'+x.th+') ' + x.fg + ' on ' + x.bg + ' [' + x.mode + ']  ' + x.file + '  «' + x.sel + '»'));
}
console.log('\n---- WARN 明细(前 60 条,人工裁决) ----');
warns.slice(0,60).forEach(x=>console.log('['+x.theme+'] ' + x.cr + ' ' + x.fg + ' on ' + x.bg + ' [' + x.mode + ']  ' + x.file + '  «' + x.sel + '»'));
if(warns.length>60) console.log('… 其余 ' + (warns.length-60) + ' 条略');
process.exit(fails.length ? 1 : 0);
