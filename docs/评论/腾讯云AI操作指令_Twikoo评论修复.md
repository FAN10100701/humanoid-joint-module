# 腾讯云 AI Agent 操作指令:修复 Twikoo 评论(CloudBase 云接入)

> 用途:把本文件内容整体粘贴给腾讯云 AI Agent(如腾讯云控制台的 AI 助手/CloudBase AI),让它代为排查并修复。所有路径均以 CloudBase 控制台为准。

---

## 一、环境信息(必读)

- 云开发环境 ID:`twikoo-env-d1gjabi5l2e5613b2`(地域 ap-shanghai)
- 云函数名称:`twikoo`(运行时 Nodejs18.15,由官方模板部署)
- 网关路由:`/twikoo`,访问地址:
  `https://twikoo-env-d1gjabi5l2e5613b2-1384309057.ap-shanghai.app.tcloudbase.com/twikoo`
- 前端网站域名:`https://cyco.top`
- 前端 Twikoo 版本:1.7.19(与云函数一致,要求前后端版本相同)
- 前端配置方式:**完整 URL 模式**(envId 填完整网关地址,不填 region/path)

## 二、目标现象

1. 浏览器从 cyco.top 请求网关时,评论无法加载/提交
2. 实测:OPTIONS 预检返回 204 且带 `Access-Control-Allow-Origin: *`(CORS 补丁已生效)
3. 但 GET/POST 请求返回 **401 Unauthorized**(怀疑网关「访问鉴权/网关策略」拦截匿名请求)
4. 用户之前用「短 ID + region」模式时报 `anonymousAuthProvider is not a function`(前端走了腾讯云 SDK 通道,环境未启用匿名登录)——已改为完整 URL 模式,此项已解决

## 三、请按顺序执行以下排查与修复

### 第 1 步:确认云函数代码中的 CORS 补丁在「文件最末尾」

1. CloudBase 控制台 → 云开发 → 环境 `twikoo-env-d1gjabi5l2e5613b2` → 云函数 → `twikoo` → 「函数代码」
2. 打开 `index.js`,滚动到**文件最末尾**(原始 `exports.main = async ...` 定义结束之后),必须存在以下补丁代码:

```js
/* ===== CORS + HTTP 网关适配补丁(必须位于本文件最末尾) ===== */
const _ORIG_MAIN = exports.main;
exports.main = async (event, context) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS' || event.method === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  let twEvent = event;
  if (event.httpMethod) {
    const m = String(event.path || '').match(/\/apis\/([^/]+)$/);
    const api = m ? m[1] : null;
    let body = {};
    if (event.body) {
      const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf-8') : event.body;
      try { body = JSON.parse(raw); } catch (e) {}
    }
    twEvent = Object.assign({}, event, body, { event: api, httpMethod: event.httpMethod });
  }
  const data = await _ORIG_MAIN(twEvent, context);
  return {
    statusCode: 200,
    headers: cors,
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
};
```

3. 检查要点:
   - 补丁必须**在文件末尾**(原始 main 之后),否则会被覆盖或 `_ORIG_MAIN` 为 undefined
   - 补丁中 `_ORIG_MAIN` 必须捕获原始 `exports.main`
   - 若缺失:把上面代码粘贴到 `index.js` 末尾,点「保存并部署」

### 第 2 步:检查并关闭网关「访问鉴权 / 网关策略」(401 的根源)

1. CloudBase 控制台 → 云开发 → 环境 → **HTTP 访问服务 / 云接入**(或「云函数 → twikoo → 触发方式 → HTTP 访问服务」)
2. 找到 `twikoo` 服务(路由 `/twikoo`),进入配置/编辑
3. 逐项检查并修改:
   - **跨域校验**:若开启,改为「关闭」(免费/体验版无法添加 Web 安全域名白名单,开启会拦截 cyco.top)
   - **访问鉴权 / 鉴权方式**:若为「需要鉴权/签名」,改为「**无需鉴权 / 公开访问 / 匿名访问**」
   - **网关策略(OPA)/ 安全规则**:确认默认策略允许匿名访问;若存在 deny 规则命中 `/twikoo` 路径或非登录用户,删除或放行
4. 保存配置

### 第 3 步:确认云函数「登录授权」不阻塞(可选)

- 环境 → 登录授权:本方案走完整 URL(HTTP 网关)模式,**不需要**启用「匿名登录」;但若已开启「自定义登录」私钥配置,不影响 HTTP 网关调用,可保留

### 第 4 步:部署与验证

1. 云函数代码改完后:**保存 → 部署**(务必重新部署,编辑器保存不等于生效)
2. 用以下命令验证(在任意可访问外网的终端执行):

```
# ① 预检(应返回 204 且带 Access-Control-Allow-Origin: *)
curl -i -X OPTIONS "https://twikoo-env-d1gjabi5l2e5613b2-1384309057.ap-shanghai.app.tcloudbase.com/twikoo" \
  -H "Origin: https://cyco.top" -H "Access-Control-Request-Method: POST"

# ② 业务请求(应返回 200 且 body 为 JSON,而非 401)
curl -i -X POST "https://twikoo-env-d1gjabi5l2e5613b2-1384309057.ap-shanghai.app.tcloudbase.com/twikoo/apis/GET_FUNC_VERSION" \
  -H "Origin: https://cyco.top" -H "Content-Type: application/json" -d '{}'

# ③ 评论读取(应返回 200,body 含 {"code":0,...})
curl -i -X POST "https://twikoo-env-d1gjabi5l2e5613b2-1384309057.ap-shanghai.app.tcloudbase.com/twikoo/apis/COMMENT_GET" \
  -H "Origin: https://cyco.top" -H "Content-Type: application/json" \
  -d '{"url":"/test-page","page":0}'
```

3. 判定标准:
   - ②③ 若返回 **200** 且 body 是 JSON(`{"code":0,...}` 或 `{"code":1,"message":"..."}` 都算云函数已响应)——网关链路已通
   - 若仍返回 **401**:说明网关鉴权未关闭,回到第 2 步检查;请把「HTTP 访问服务」配置页当前可见的所有开关/选项原文列出来,我会告诉你改哪一项
   - 若返回 **404**:说明补丁中 path 提取与路由不匹配,把 curl ② 的完整响应发我

### 第 5 步:前端配合(无需 AI 操作,仅供了解)

- 前端 `_assets/giscus-config.js` 已配置 envId = 完整网关地址;评论区上方有 🔍 诊断日志输出(独立容器,不会被 Twikoo 清空)
- 前端探针会显示:配置读取 → CDN 加载 → twikoo.init → Promise 结果;若 init 后仍失败,日志会给出具体错误

## 四、需要反馈给用户的信息

修复完成后,请告知:
1. 每步检查到的实际配置值(如:跨域校验=关闭/开启,鉴权=无需/需签名,网关策略=默认/自定义)
2. 是否修改了云函数代码(补丁是否存在/补上了)
3. 第 4 步三条 curl 的完整输出(状态码 + 响应头 + body)
4. 若仍有问题,给出你排查到的下一步建议
