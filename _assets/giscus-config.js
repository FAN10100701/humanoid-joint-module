/* 全站评论区配置(统一入口,site.js initComments 动态加载)
 * provider 二选一:
 *   "twikoo" —— 需要自托管后端(CloudBase 云函数 / Vercel / Zeabur),envId 为部署后生成的 ID
 *   "valine" —— LeanCloud 存储(推荐,国内版免费,纯配置零部署),需要 appId/appKey/serverURLs
 * 切换后无需改动任何页面,刷新即生效;默认走 Valine(最快可用)。
 */
window.COMMENTS_CONFIG = {
  provider: "valine",
  appId: null,      /* Valine:LeanCloud 应用的 AppID */
  appKey: null,     /* Valine:LeanCloud 应用的 AppKey */
  serverURLs: null, /* Valine:LeanCloud 国际版需填 https://xxx.api.lncldglobal.com */
  envId: "twikoo-env-d1gjabi5l2e5613b2", /* Twikoo:后端部署后生成的 envId */
  region: ""        /* Twikoo:国内 "" / 海外 "ap-shanghai" 等 */
};
