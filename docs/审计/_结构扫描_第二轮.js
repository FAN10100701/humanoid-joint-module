// 全站隐含结构问题扫描(临时工具,配合图片迭代第二轮)
"use strict";
const fs = require("fs");
const path = require("path");
const root = process.cwd();
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "_site-backup") continue;
      walk(p, out);
    } else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}
const files = walk(root);
let issues = 0;
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  const rel = path.relative(root, f).split(path.sep).join("/");
  // 1) </html> 之后内容
  const endHtml = s.lastIndexOf("</html>");
  const tail = s.slice(endHtml + 7).trim();
  if (tail.length > 0) { issues++; console.log("[AFTER-</html>] " + rel + " tail=" + tail.length + "ch :: " + JSON.stringify(tail.slice(0, 80))); }
  // 2) 多个 </html>
  const nEnd = (s.match(/<\/html>/g) || []).length;
  if (nEnd !== 1) { issues++; console.log("[MULTI-</html>] " + rel + " count=" + nEnd); }
  // 3) div 配平
  const od = (s.match(/<div[\s>]/g) || []).length, cd = (s.match(/<\/div>/g) || []).length;
  if (od !== cd) { issues++; console.log("[DIV-BALANCE] " + rel + " open=" + od + " close=" + cd); }
  // 4) my-fig-cap 重复文本
  const caps = [...s.matchAll(/class="my-fig-cap"[^>]*>([^<]{8,})</g)].map(m => m[1].trim());
  const capseen = new Set();
  for (const c of caps) { if (capseen.has(c)) { issues++; console.log("[DUP-CAP] " + rel + " :: " + c.slice(0, 40)); } capseen.add(c); }
  // 5) figcaption 重复
  const fcs = [...s.matchAll(/<figcaption[^>]*>([^<]{8,})</g)].map(m => m[1].trim());
  const fcseen = new Set();
  for (const c of fcs) { if (fcseen.has(c)) { issues++; console.log("[DUP-FIGCAPTION] " + rel + " :: " + c.slice(0, 40)); } fcseen.add(c); }
  // 6) svg aria-label 重复(同页)
  const aris = [...s.matchAll(/<svg[^>]*aria-label="([^"]{6,})"/g)].map(m => m[1]);
  const aseen = new Set();
  for (const a of aris) { if (aseen.has(a)) { issues++; console.log("[DUP-ARIA] " + rel + " :: " + a.slice(0, 40)); } aseen.add(a); }
}
console.log("== 扫描文件 " + files.length + " 个,问题 " + issues + " 处");
