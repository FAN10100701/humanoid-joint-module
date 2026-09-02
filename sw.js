/* ============================================================
   人形机器人学习站 · 全站 Service Worker(离线缓存)
   - 预缓存: 首页 / 全站样式与脚本 / 404 页
   - 静态资源(_assets): stale-while-revalidate(先缓存后台更新,改代码无需 bump CACHE)
   - 页面: stale-while-revalidate(访问过的页面离线可用)
   - 00_3D 目录: 交给 3D 页自己的 Service Worker(本 sw 不碰)
   - ⚠ 双SW纪律: 改动任一覆盖域内的文件后,必须 bump 对应 CACHE/SW_VERSION,否则用户端永远吃旧文件
   - 版本: V2.1.6 · 2026-08-30(升级站点时改 CACHE 名以强制更新)
   ============================================================ */
var CACHE = "hrl-site-v2.1.7";
var PRECACHE = [
  "./index.html",
  "./404.html",
  "./_assets/site.css",
  "./_assets/site.js",
  "./_assets/search-index.js",
  "./_assets/page-meta.js",
  "./_assets/ib-data-a.js",
  "./_assets/ib-data-b.js",
  "./_assets/ib-data-c.js",
  "./_assets/quest-data.js",
  "./_assets/ai-assistant.js",
  "./_assets/quiz-bank.js",
  "./08_学习工具/11_保研复试面试题库.html",
  "./08_学习工具/12_闯关学习.html",
  "./08_学习工具/13_AI答疑助手.html",
  "./08_学习工具/14_个人作品台.html"
];

self.addEventListener("install", function(e){
  e.waitUntil(
    /* 容错预缓存:逐项 cache:"reload" 强制网络获取(防上一版本旧资源固化);
       单项失败仅跳过并告警,不让 install 整体 reject——否则部署期一个 404
       就会把所有用户锁死在旧版本缓存里,页面"新旧混杂、时好时坏" */
    caches.open(CACHE).then(function(c){
      return Promise.all(PRECACHE.map(function(u){
        return fetch(u, { cache:"reload" }).then(function(r){
          if(!r.ok){ console.warn("[SW] 预缓存跳过(非200):", u, r.status); return; }
          return c.put(u, r);
        }).catch(function(err){ console.warn("[SW] 预缓存失败(网络):", u, err); });
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e){
  if(e.request.method !== "GET") return;
  var url;
  try{ url = new URL(e.request.url); }catch(err){ return; }
  if(url.origin !== location.origin) return;          /* 跨域不缓存 */
  if(url.pathname.indexOf("/00_3D") >= 0) return;     /* 3D 目录交给 3D 专用 sw */

  if(url.pathname.indexOf("/_assets/") >= 0){
    /* 静态资源: stale-while-revalidate(V2.1.4)——
       先回缓存(秒开,离线可用),同时后台拉最新更新缓存;
       在线时最多晚一次访问看到新资源,改代码无需再 bump CACHE */
    e.respondWith(
      caches.match(e.request).then(function(hit){
        var fetchP = fetch(e.request).then(function(res){
          if(res && res.ok){
            var cp = res.clone();
            caches.open(CACHE).then(function(c){ c.put(e.request, cp); });
          }
          return res;
        }).catch(function(){ return hit; });
        return hit || fetchP;
      })
    );
    return;
  }
  /* 页面: stale-while-revalidate */
  e.respondWith(
    caches.match(e.request).then(function(hit){
      var fetchP = fetch(e.request).then(function(res){
        if(res && res.ok){
          var cp = res.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, cp); });
        }
        return res;
      }).catch(function(){ return hit; });
      return hit || fetchP;
    })
  );
});
