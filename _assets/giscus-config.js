/* 全站评论区配置(统一入口,site.js initComments 动态加载)
 * provider 二选一:
 *   "twikoo" —— 自托管后端(CloudBase 云函数 / Vercel / Zeabur),envId 填完整访问地址
 *   "valine" —— LeanCloud 存储(国内版免费,纯配置零部署),需要 appId/appKey/serverURLs
 * 切换后无需改动任何页面,刷新即生效。
 * 2026-08-17:CloudBase 云函数 + 网关 /twikoo 部署完成,envId 填完整访问地址(网关已验证 HTTP 200)。
 */
window.COMMENTS_CONFIG = {
  provider: "twikoo",
  appId: null,      /* Valine:LeanCloud 应用的 AppID */
  appKey: null,     /* Valine:LeanCloud 应用的 AppKey */
  serverURLs: null, /* Valine:LeanCloud 国际版需填 https://xxx.api.lncldglobal.com */
  envId: "https://twikoo-env-d1gjabi5l2e5613b2-1384309057.ap-shanghai.app.tcloudbase.com/twikoo",
  region: ""        /* Twikoo 自托管 URL 模式无需 region;仅腾讯云托管简写 envId 时按需填 ap-shanghai 等 */
};
