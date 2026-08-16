/* ============================================================
   PWA Service Worker —— 离线缓存与二次访问加速
   策略：
   1) 核心资源（本页 HTML）install 时预缓存
   2) 模型 .drc(Draco) / .gz / STL / JS 库等静态资源：访问时缓存（cache-first），
      二次访问零网络下载，完全离线可浏览
   3) HTML 导航请求：network-first（保证教学内容更新及时），断网回退缓存
   4) 改 SW_VERSION 版本号即可整体刷新全部缓存
   ============================================================ */
var SW_VERSION='robot-3d-v17';           /* 【可调】缓存版本号：改动后旧缓存自动清除（v11：调试探针+失败提示日志+底部栏可收起(含v10主页悬浮按钮)） */
var CORE_CACHE=SW_VERSION+'-core';       /* 核心资源缓存名（install 预缓存） */
var RUNTIME_CACHE=SW_VERSION+'-runtime'; /* 运行时缓存名（模型等按需缓存） */

/* 核心资源清单：仅本页 HTML（库与模型首次访问时进运行时缓存，避免 install 过重） */
var CORE_ASSETS=[
  '人形机器人解剖式知识可视化.html'
];

/* install：预缓存核心资源（单个失败忽略，不阻塞安装），立即接管 */
self.addEventListener('install',function(e){
  e.waitUntil(
    caches.open(CORE_CACHE).then(function(c){
      return Promise.all(CORE_ASSETS.map(function(u){
        return c.add(u).catch(function(){/* 单个预缓存失败忽略，运行时可补 */});
      }));
    }).then(function(){return self.skipWaiting();})
  );
});

/* activate：清掉所有不属于当前版本的旧缓存，立即接管所有页面 */
self.addEventListener('activate',function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){
        return k.indexOf(SW_VERSION)!==0;   /* 缓存名不带当前版本号 = 旧版本缓存 */
      }).map(function(k){return caches.delete(k);}));
    }).then(function(){return self.clients.claim();})
  );
});

/* fetch：分流拦截 */
self.addEventListener('fetch',function(e){
  var req=e.request;
  if(req.method!=='GET')return;             /* 只处理 GET */
  var url=new URL(req.url);
  if(url.origin!==location.origin)return;   /* 只处理同源请求 */
  /* HTML 导航请求：network-first —— 网络优先保证内容最新，断网回退缓存页面 */
  if(req.mode==='navigate'){
    e.respondWith(
      fetch(req).then(function(r){
        var cp=r.clone();
        caches.open(CORE_CACHE).then(function(c){c.put(req,cp);});  /* 回写最新页面 */
        return r;
      }).catch(function(){
        return caches.match(req);           /* 断网：回退上次缓存的页面 */
      })
    );
    return;
  }
  /* 静态资源（.drc 模型 / .gz 模型 / .STL / .js 库 / 图片）：cache-first —— 命中即回，零网络 */
  e.respondWith(
    caches.match(req).then(function(hit){
      if(hit)return hit;                    /* 二次访问：直接走本地缓存 */
      return fetch(req).then(function(r){
        if(r.ok){                           /* 仅 200 成功响应入缓存 */
          var cp=r.clone();
          caches.open(RUNTIME_CACHE).then(function(c){c.put(req,cp);});
        }
        return r;
      });
    })
  );
});
