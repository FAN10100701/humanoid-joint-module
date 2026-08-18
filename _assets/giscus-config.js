/* 全站评论区配置(统一入口,site.js initComments 动态加载)
 * 当前方案:Twikoo + CloudBase 云接入网关(HTTP 触发器模式)
 *   envId = 完整网关访问地址 —— 与「云接入/HTTP 网关」部署形态匹配,
 *           前端直接 HTTP 调用网关,不走腾讯云 SDK(无需匿名登录/私钥)
 *   path  = 不配置:评论分区自动用当前页面路径(每页独立评论区)
 * ⚠ 重要:不要用短 ID + region 模式 —— 那会触发 Twikoo 内置腾讯云 SDK
 *   的匿名登录流程(anonymousAuthProvider 错误),与 HTTP 网关部署不匹配。
 * CORS 前提:CloudBase 网关必须放行 cyco.top(见 _本地工具/评论系统接入指南.md)
 * 备用方案:Valine(LeanCloud 纯配置零部署)——provider 改 "valine" 并填 appId/appKey。
 */
window.COMMENTS_CONFIG = {
  provider: "twikoo",
  envId: "https://twikoo-env-d1gjabi5l2e5613b2-1384309057.ap-shanghai.app.tcloudbase.com/twikoo",
  region: "",
  path: null,
  /* --- Valine 备用字段(provider 切 "valine" 时填写) --- */
  appId: null,
  appKey: null,
  serverURLs: null
};
