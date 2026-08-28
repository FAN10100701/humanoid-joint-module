/* ============================================================
   人形机器人学习站 · 新页面一键登记(_本地工具/登记页面.js)
   用法: node 登记页面.js 登记配置.json
   配置: { pageId, folder, file, title, desc, keywords, sec, secName,
          time, prereq, goals:[] }
   自动登记六处: search-index / sitemap / page-meta / 学习地图 /
                index(SECTIONS+卡片) / 百度提交清单
   ============================================================ */
const fs = require("fs"), path = require("path");
const cfg = JSON.parse(fs.readFileSync(process.argv[2] || "登记配置.json", "utf8"));
const root = path.join(__dirname, "..");
const R = p => fs.readFileSync(path.join(root, p), "utf8");
const W = (p, s) => fs.writeFileSync(path.join(root, p), s);
const secKey = String(cfg.sec).length < 2 ? "0" + cfg.sec : String(cfg.sec);   /* 8 -> 08 */
const urlPath = cfg.folder + "/" + cfg.file;

/* 1) search-index: 末尾 "];" 前插入 */
let s = R("_assets/search-index.js");
const idxEnd = s.lastIndexOf("];");
s = s.slice(0, idxEnd) + '  { t:"' + cfg.title + '", u:"' + urlPath + '", s:"' + cfg.secName + '", d:"' + cfg.desc + '", k:"' + cfg.keywords + '" },\n' + s.slice(idxEnd);
W("_assets/search-index.js", s);

/* 2) sitemap */
s = R("sitemap.xml");
s = s.replace("</urlset>", '  <url><loc>https://cyco.top/' + urlPath + '</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n</urlset>');
W("sitemap.xml", s);

/* 3) page-meta: 末尾 "};"/"]; " 前插入(自动补逗号) */
s = R("_assets/page-meta.js").replace(/\r\n/g, "\n");
const pmEnd = s.lastIndexOf("};");
let head = s.slice(0, pmEnd).replace(/,\s*$/, "") + ",\n";
s = head + '  "' + cfg.pageId + '": { time:"' + cfg.time + '", prereq:"' + cfg.prereq + '", updated:"' + new Date().toISOString().slice(0,10) + '", verified:"待人工复核", goals:' + JSON.stringify(cfg.goals) + ' }\n};\n';
W("_assets/page-meta.js", s);

/* 4) 学习地图: 在 08-15 节点后插入 */
s = R("08_学习工具/06_学习地图.html");
const mapAnchor = '{ id: "08-15", t: "全站体检", u: "../08_学习工具/15_全站体检.html" },';
if(s.indexOf(mapAnchor) < 0){ console.error("学习地图锚点未找到,请手动加节点"); }
else s = s.replace(mapAnchor, mapAnchor + '\n    { id: "' + cfg.pageId + '", t: "' + cfg.title + '", u: "../' + urlPath + '" },');
W("08_学习工具/06_学习地图.html", s);

/* 5) index.html: SITE_SECTIONS 该组 ids 追加 + sec 网格末尾插卡片 */
s = R("index.html");
const keyIdx = s.indexOf('key:"' + secKey + '"');
if(keyIdx < 0) throw new Error("SITE_SECTIONS 未找到板块 " + secKey);
const idsStart = s.indexOf("ids:[", keyIdx) + 5;
const idsEnd = s.indexOf("]", idsStart);
if(s.slice(idsStart, idsEnd).indexOf(cfg.pageId) < 0)
  s = s.slice(0, idsEnd) + ',"' + cfg.pageId + '"' + s.slice(idsEnd);
const secIdx = s.indexOf('id="sec' + secKey + '"');
const gridClose = s.indexOf("    </div>", secIdx);
s = s.slice(0, gridClose) + '      <a class="card" href="' + urlPath + '"><span class="go">进入 →</span><div class="ic">📄</div><div class="t">' + cfg.title + '</div><div class="d">' + cfg.desc + '</div></a>\n' + s.slice(gridClose);
W("index.html", s);

/* 6) 百度清单 */
fs.appendFileSync(path.join(root, "docs", "收录", "百度手动提交URL清单.txt"), "https://cyco.top/" + urlPath + "\n");

console.log("已登记:", cfg.pageId, "->", urlPath);
console.log("请复查 index.html 卡片文案,并跑 一键自检.ps1");
