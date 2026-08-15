# 启动服务器.ps1 — 本地静态服务器(启动教学页面用)
# 说明: 3D 页面必须通过 http 访问(URDF/STL/three.js 在 file:// 下无法加载),
#       本脚本在站点根目录启动 http 服务,默认端口 8123。
# 优先使用 Python(python -m http.server),没有 Python 时回退 Node.js。
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$port = 8123

$py = Get-Command python -ErrorAction SilentlyContinue
$node = Get-Command node -ErrorAction SilentlyContinue

if($py){
  Write-Host "============================================================"
  Write-Host "  人形机器人学习站 · 本地服务器已启动"
  Write-Host "  请用浏览器打开: http://127.0.0.1:$port/"
  Write-Host "  关闭本窗口即停止服务"
  Write-Host "============================================================"
  Push-Location $root
  python -m http.server $port --bind 127.0.0.1
  Pop-Location
}elseif($node){
  Write-Host "Python 未找到,使用 Node.js 启动..."
  $js = @'
const http=require('http'),fs=require('fs'),path=require('path');
const root=process.cwd(), port=8123;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json','.wasm':'application/wasm','.stl':'model/stl','.drc':'application/octet-stream','.gz':'application/gzip','.urdf':'application/xml','.md':'text/plain; charset=utf-8','.ico':'image/x-icon'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/')p='/index.html';
  let fp=path.join(root,p);
  if(!fp.startsWith(root)){res.writeHead(403);res.end();return;}
  fs.readFile(fp,(e,d)=>{
    if(e){res.writeHead(404);res.end('404');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(fp).toLowerCase()]||'application/octet-stream'});
    res.end(d);
  });
}).listen(port,'127.0.0.1',()=>{
  console.log('Server: http://127.0.0.1:'+port+'/  (Ctrl+C to stop)');
});
'@
  Push-Location $root
  node -e $js
  Pop-Location
}else{
  Write-Host "[ERROR] 未找到 Python 或 Node.js,无法启动本地服务器。"
  Write-Host "请先安装 Python: https://www.python.org/downloads/"
  Read-Host "按回车退出"
  exit 1
}
