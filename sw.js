/* ============================================================
   人形机器人学习站 · 全站 Service Worker(离线缓存)
   - 预缓存: 首页 / 全站样式与脚本 / 404 页
   - 静态资源(_assets): 缓存优先
   - 页面: stale-while-revalidate(访问过的页面离线可用)
   - 00_3D 目录: 交给 3D 页自己的 Service Worker(本 sw 不碰)
   - 版本: V1.9.3 · 2026-08-17(升级站点时改 CACHE 名以强制更新)
   ============================================================ */
var CACHE = "hrl-site-v1.9.3";
var PRECACHE = [
  "./index.html",
  "./404.html",
  "./_assets/site.css",
  "./_assets/site.js",
  "./_assets/search-index.js",
  "./_assets/page-meta.js"
];

self.addEventListener("install", function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(PRECACHE); })
      .then(function(){ return self.skipWaiting(); })
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
    /* 静态资源: 缓存优先 */
    e.respondWith(
      caches.match(e.request).then(function(hit){
        return hit || fetch(e.request).then(function(res){
          if(res && res.ok){
            var cp = res.clone();
            caches.open(CACHE).then(function(c){ c.put(e.request, cp); });
          }
          return res;
        });
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
