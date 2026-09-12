/* ============================================================
   人形机器人学习站 · 全站 Service Worker(离线缓存)
   - 预缓存: 首页 / 全站样式与脚本 / 404 页
   - 静态资源(_assets): stale-while-revalidate(先缓存后台更新,改代码无需 bump CACHE)
   - 页面: stale-while-revalidate(访问过的页面离线可用)
   - 00_3D 目录: 交给 3D 页自己的 Service Worker(本 sw 不碰)
   - ⚠ 双SW纪律: 改动任一覆盖域内的文件后,必须 bump 对应 CACHE/SW_VERSION,否则用户端永远吃旧文件
   - 版本: V2.1.28 · 2026-09-12(升级站点时改 CACHE 名以强制更新;本版 activate 收敛为只清 hrl-site- 域缓存(A-57 缓存互删根治),en-audio MP3 走 _assets SWR 播放时缓存+MD5 寻址不回源)
   ============================================================ */
var CACHE = "hrl-site-v2.1.28";
var PRECACHE = [
  "./index.html",
  "./404.html",
  "./_assets/site.css",
  "./_assets/site.js",
  "./_assets/search-index.js",
  "./_assets/page-meta.js",
  "./_assets/path-data.js",
  "./_assets/ib-data-a.js",
  "./_assets/ib-data-b.js",
  "./_assets/ib-data-c.js",
  "./_assets/ib-data-d.js",
  "./_assets/en-terms.js",
  "./_assets/quest-data.js",
  "./_assets/ai-assistant.js",
  "./_assets/quiz-bank.js",
  "./_assets/en-interview-data.js",
  "./_assets/en-dict.js",
  "./_assets/en-notes.js",
  "./_assets/en-audio-map.js",   /* V2.1.23:内置音频清单;MP3 本体走 _assets SWR 播放时缓存 */
  "./06_学习工具/11_保研复试面试题库.html",
  "./06_学习工具/16_保研英语面试.html",
  "./06_学习工具/12_闯关学习.html",
  "./06_学习工具/13_AI答疑助手.html",
  "./06_学习工具/14_个人作品台.html",
  "./06_学习工具/17_AI_Agent介绍.html",
  "./06_学习工具/18_学习路径规划.html"
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
    /* V2.1.28(A-57): 只清理本站 hrl-site- 域的旧版本缓存。此前删所有非当前 CACHE 名的
       缓存,会把 3D 专用 SW 的 robot-3d-models-v1(约 16-18MB 模型)与 robot-3d-vXX-* 代码
       缓存一并清空——每次站点发版后 3D 页被迫全量重下,弱网下引擎 25s 超时/模型挂起,
       即"人形机器人又显示不出来"。缓存所有权约定:根 SW 只管 hrl-site-*,3D SW 只管 robot-3d-* */
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k.indexOf("hrl-site-") === 0 && k !== CACHE; }).map(function(k){ return caches.delete(k); }));
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
       在线时最多晚一次访问看到新资源,改代码无需再 bump CACHE
       V2.1.8: 后台更新加 cache:"reload" 绕过 HTTP 缓存——此前不在 PRECACHE
       清单的文件(如 site-selftest.js/ai-fab-chat.js/glass.css)的后台 revalidate
       会被 HTTP 缓存(max-age 3600)污染,部署后 1 小时内拿不到新版。
       V2.1.28: _assets/en-audio/ 例外——MP3 按内容 md5 寻址、永不改版,命中直接回、
       不做后台 revalidate(此前每播一段就悄悄回源一次,664 段音频在弱网下互相抢带宽,
       也会拖慢尚未缓存的新文件首播);未命中才走网络并顺手落缓存 */
    var isAudio = url.pathname.indexOf("/_assets/en-audio/") >= 0;
    e.respondWith(
      caches.match(e.request).then(function(hit){
        if(isAudio){
          if(hit) return hit;
          return fetch(e.request).then(function(res){
            if(res && res.ok){
              var cp0 = res.clone();
              caches.open(CACHE).then(function(c){ c.put(e.request, cp0); });
            }
            return res;
          });
        }
        var fetchP = fetch(e.request, { cache:"reload" }).then(function(res){
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
  /* 页面: stale-while-revalidate(V2.1.8: 后台更新同样 cache:"reload" 防HTTP缓存污染) */
  e.respondWith(
    caches.match(e.request).then(function(hit){
      var fetchP = fetch(e.request, { cache:"reload" }).then(function(res){
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
