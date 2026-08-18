/* ============================================================
   评论区配置 · Twikoo(2026-08-17 起,替代 giscus)
   —— giscus 的后端 giscus.app 在国内被墙,评论区永远无法工作;
      Twikoo 前端走 jsDelivr(国内可达),后端用腾讯云 CloudBase 免费版。
   启用步骤(详见 _本地工具/评论系统接入指南.md):
   1) 注册腾讯云 CloudBase,创建环境(免费版即可)
   2) 在环境里安装「Twikoo 评论」扩展,记下环境 ID(envId)
   3) 把下方 envId 从 null 改为你的环境 ID
   4) 部署后每个内容页底部会出现评论区
   ============================================================ */
window.COMMENTS_CONFIG = {
  provider: "twikoo",
  envId: "twikoo-env-d1gjabi5l2e5613b2",
  region: ""            /* 中国大陆环境留空;海外环境填 "ap-shanghai" 等 */
};
