/* ============================================================
   PWA Service Worker —— 离线缓存与二次访问加速
   策略：
   1) 核心资源（本页 HTML）install 时预缓存
   2) 模型 .drc(Draco) / .gz / STL / URDF：cache-first，存"模型缓存"
      （MODELS_CACHE 独立于版本号 —— 升级代码不再清空模型，
        避免每次 sw bump 都重新下载 16-18MB 模型）
   3) JS 库等其他静态资源：cache-first，随版本号刷新
   4) HTML 导航请求：network-first（保证教学内容更新及时），断网回退缓存
   5) 改 SW_VERSION 只刷新代码/库；模型文件有更新时才手动改 MODELS_CACHE 名
   ============================================================ */
var SW_VERSION='robot-3d-v30';           /* 【可调】代码缓存版本号：bump 只清代码/库缓存，模型缓存保留。V2.1.28: activate 收敛为本域(robot-3d-)清理+URDF超时重试+'9'标记TTL(app.module.js 同批改动)须刷新代码缓存 */
var CORE_CACHE=SW_VERSION+'-core';       /* 核心资源缓存名（install 预缓存） */
var RUNTIME_CACHE=SW_VERSION+'-runtime'; /* 代码/库运行时缓存名（随版本刷新） */
var MODELS_CACHE='robot-3d-models-v1';   /* 模型缓存名（独立于版本：模型文件未变更时请勿 bump，避免全站模型重下） */

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

/* activate：只清本域(robot-3d-)旧版本代码缓存，保留模型缓存(独立名)。
   V2.1.28(A-57)：此前删所有非本版本缓存,会误删主站 hrl-site-* 缓存,与根 SW 互删——
   站点发版→3D 模型缓存被根 SW 清空;进 3D 页→主站缓存被本 SW 清空,双方反复全量重下。
   缓存所有权约定:本 SW 只管 robot-3d- 前缀,其余缓存(含 hrl-site-*)一律不动 */
self.addEventListener('activate',function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){
        return (k.indexOf('robot-3d-')===0) && (k!==CORE_CACHE) && (k!==RUNTIME_CACHE) && (k!==MODELS_CACHE);   /* 本域旧版本缓存 = 删除 */
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
  /* 模型资源(.drc/.gz/.STL/.urdf)进独立模型缓存,不随代码版本清空 */
  var isModel=/\.(drc|gz|STL|stl|urdf)$/.test(url.pathname)||url.pathname.indexOf('/models/')>=0;
  var targetCache=isModel?MODELS_CACHE:RUNTIME_CACHE;
  /* 静态资源：cache-first —— 命中即回，零网络 */
  e.respondWith(
    caches.match(req).then(function(hit){
      if(hit)return hit;                    /* 二次访问：直接走本地缓存 */
      return fetch(req).then(function(r){
        if(r.ok){                           /* 仅 200 成功响应入缓存 */
          var cp=r.clone();
          caches.open(targetCache).then(function(c){c.put(req,cp);});
        }
        return r;
      });
    })
  );
});
