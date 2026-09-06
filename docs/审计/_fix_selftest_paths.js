/* 一次性:一键自检.ps1 内 08_* 工具目录匹配式 → 06_*(ASCII 安全,2026-09-06) */
const fs = require("fs");
const f = "_本地工具/一键自检.ps1";
let s = fs.readFileSync(f, "utf8");
const before = s;
s = s.split("\\\\08_[^\\\\]*\\\\").join("\\\\06_[^\\\\]*\\\\");   /* ps1 内字面 \\08_[^\\]*\\ */
s = s.split("\\08_[^\\]*\\").join("\\06_[^\\]*\\");               /* 容错:单反斜杠形态 */
s = s.split("-like '08_*'").join("-like '06_*'");
s = s.split("08_* hosting dir not found").join("06_* hosting dir not found");
fs.writeFileSync(f, s);
console.log("changed:", s !== before);
console.log("leftover 08_ patterns:", (s.match(/\\\\08_|\-like '08_\*'|08_\* hosting/g) || []).length);
console.log("06_ patterns:", (s.match(/\\\\06_\[/g) || []).length);
