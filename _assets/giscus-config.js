/* 全站评论区配置(统一入口,site.js initComments 动态加载)
 * 2026-08-17 最终决定:免费方案全部受限(CloudBase 体验版无文档数据库集合、
 * Zeabur 也需付费、LeanCloud 停止新注册)→ 云端评论停用,
 * 评论区替换为「联系站长」卡片(显示站长邮箱,mailto 直达)。
 * 将来若开通付费后端,把 provider 改回 "twikoo"(envId 填完整地址)即可恢复。
 */
window.COMMENTS_CONFIG = {
  provider: "disabled",
  email: "2061624805@qq.com",
  /* --- 以下为恢复云端评论时的预留字段 --- */
  envId: null,
  region: "",
  path: null,
  appId: null,
  appKey: null,
  serverURLs: null
};
