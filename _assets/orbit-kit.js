/* 作品台共享引擎:three.js 多源加载 + HUD 样式 + 尺寸/循环工具(V2.1.0) */
window.OrbitKit = (function(){
  function hud(){
    if(document.getElementById("okHudStyle")) return;
    var s = document.createElement("style");
    s.id = "okHudStyle";
    s.textContent =
      "*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;background:#05070d;overflow:hidden;font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif}" +
      "#stage{position:fixed;inset:0;display:block}" +
      ".hud{position:fixed;z-index:10;color:#dbe6f5;user-select:none}" +
      ".hud-top{top:0;left:0;right:0;display:flex;align-items:center;gap:14px;padding:16px 20px;background:linear-gradient(rgba(5,7,13,.82),transparent);pointer-events:none}" +
      ".hud-top a,.hud-top button{pointer-events:auto;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.13);color:#dbe6f5;font-size:13px;padding:7px 15px;border-radius:999px;cursor:pointer;text-decoration:none;font-family:inherit;transition:.18s;backdrop-filter:blur(10px)}" +
      ".hud-top a:hover,.hud-top button:hover{border-color:#58a6ff;color:#fff}" +
      ".hud-title{font-size:15px;font-weight:800;letter-spacing:2px;color:#fff}.hud-title small{font-weight:400;color:#7d8a9c;margin-left:10px;letter-spacing:0}" +
      "#state{margin-left:auto;font-family:Consolas,monospace;font-size:12px;color:rgba(255,255,255,.45)}" +
      ".hud-bottom{left:0;right:0;bottom:0;padding:16px 20px;text-align:center;font-size:12.5px;color:rgba(255,255,255,.38);letter-spacing:1px;pointer-events:none}" +
      ".hud-panel{top:64px;right:16px;width:min(320px,88vw);background:rgba(8,12,22,.6);border:1px solid rgba(140,190,255,.28);border-radius:16px;padding:16px 18px;backdrop-filter:blur(18px);display:none}" +
      ".hud-panel.open{display:block}.hud-panel h4{color:#8ec5ff;font-size:14px;margin-bottom:8px}.hud-panel p,.hud-panel li{font-size:12.5px;color:#aab8c8;line-height:1.9}" +
      "#loader{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;background:#05070d;color:#8b98a9;font-size:13.5px;letter-spacing:2px;transition:opacity .7s}" +
      "#loader.hide{opacity:0;pointer-events:none}#loader .ring{width:34px;height:34px;border-radius:50%;border:2px solid rgba(255,255,255,.12);border-top-color:#58a6ff;animation:okspin 1s linear infinite}@keyframes okspin{to{transform:rotate(360deg)}}";
    document.head.appendChild(s);
  }
  async function loadThree(loadTxt){
    var urls = [
      "../../00_3D解剖/lib/three.module.js",
      "https://registry.npmmirror.com/three/0.160.0/files/build/three.module.js",
      "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "https://unpkg.com/three@0.160.0/build/three.module.js"
    ];
    for(var i = 0; i < urls.length; i++){
      try{
        if(loadTxt) loadTxt.textContent = "加载 " + (urls[i].indexOf("lib") >= 0 ? "本地" : "CDN " + i) + " three.js …";
        return await import(urls[i]);
      }catch(e){}
    }
    throw new Error("three.js 所有源均加载失败");
  }
  function fit(renderer, cam){
    function on(){
      renderer.setSize(innerWidth, innerHeight);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      cam.aspect = innerWidth/innerHeight; cam.updateProjectionMatrix();
    }
    addEventListener("resize", on); on();
  }
  return { hud: hud, loadThree: loadThree, fit: fit };
})();
