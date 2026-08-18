/* 全站评论区配置(统一入口,site.js initComments 动态加载)
 * 当前方案:Twikoo + CloudBase 云接入网关(腾讯云开发模式)
 *   envId  = CloudBase 环境 ID(短 ID 模式,云接入网关 /twikoo 已配置)
 *   region = ap-shanghai(上海环境)
 *   path   = /twikoo(云接入网关路由,与 CloudBase 部署摘要示例一致)
 *   前端版本 1.7.19 与云函数版本保持一致(官方要求)。
 * 前置条件(重要,否则「评论失败: 0」或评论区空白):
 *   ① 环境-登录授权:启用「匿名登录」
 *   ② 环境-安全配置:把 https://cyco.top 加入「Web 安全域名」
 *   ③ 管理面板:评论窗口「⚙️ 小齿轮」→ 粘贴「自定义登录私钥」并设置管理员密码
 * 备用方案:Valine(LeanCloud 纯配置零部署)——provider 改 "valine" 并填 appId/appKey。
 */
window.COMMENTS_CONFIG = {
  provider: "twikoo",
  envId: "twikoo-env-d1gjabi5l2e5613b2",
  region: "ap-shanghai",
  path: "/twikoo",
  /* --- Valine 备用字段(provider 切 "valine" 时填写) --- */
  appId: null,
  appKey: null,
  serverURLs: null
};
