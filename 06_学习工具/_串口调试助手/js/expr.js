/* ============================================================
   网页端串口调试助手 · SerialLab
   模块：expr（安全算术表达式求值）
   职责：把用户写的映射公式（如 temp*0.01 + 2）编译成可反复求值的函数。
         插件是「声明式配置」，用户不能注入代码，但需要一点算术自由度，
         所以这里手写词法分析 + 调度场算法转 RPN + 栈式求值，
         全程不碰 eval / new Function（否则导入的配置包就成了 XSS 后门）。
   依赖：无（叶子模块）
   ============================================================ */
;(function (global) {
  "use strict";

  var SL = global.SerialLab = global.SerialLab || {};
  var E = {};

  /* 允许的函数白名单（这是安全边界：白名单之外一律拒绝） */
  var FUNCS = {
    abs: { n: 1, f: Math.abs },
    sqrt: { n: 1, f: Math.sqrt },
    sin: { n: 1, f: Math.sin },
    cos: { n: 1, f: Math.cos },
    tan: { n: 1, f: Math.tan },
    log: { n: 1, f: Math.log },
    log10: { n: 1, f: Math.log10 || function (x) { return Math.log(x) / Math.LN10; } },
    exp: { n: 1, f: Math.exp },
    floor: { n: 1, f: Math.floor },
    ceil: { n: 1, f: Math.ceil },
    round: { n: 1, f: Math.round },
    sign: { n: 1, f: Math.sign || function (x) { return x > 0 ? 1 : (x < 0 ? -1 : 0); } },
    min: { n: 2, f: Math.min },
    max: { n: 2, f: Math.max },
    pow: { n: 2, f: Math.pow },
    atan2: { n: 2, f: Math.atan2 }
  };

  var CONSTS = { pi: Math.PI, e: Math.E };

  /* 一元运算符用 u- / u+ 表示，避免与二元减号混淆 */
  var PREC = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3, "u-": 4, "u+": 4 };
  var RIGHT_ASSOC = { "^": true, "u-": true, "u+": true };

  E.FUNCS = FUNCS;
  E.CONSTS = CONSTS;

  /* ---------------- 词法分析 ---------------- */
  function isDigit(ch) { return ch >= "0" && ch <= "9"; }
  function isAlpha(ch) {
    return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
  }
  function isAlnum(ch) { return isAlpha(ch) || isDigit(ch); }

  function lex(src) {
    var out = [];
    var i = 0;
    var n = src.length;
    while (i < n) {
      var ch = src.charAt(i);

      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i++; continue; }

      /* 数字：整数 / 小数 / 科学计数法 */
      if (isDigit(ch) || (ch === "." && isDigit(src.charAt(i + 1)))) {
        var start = i;
        while (i < n && isDigit(src.charAt(i))) { i++; }
        if (src.charAt(i) === ".") {
          i++;
          while (i < n && isDigit(src.charAt(i))) { i++; }
        }
        var eCh = src.charAt(i);
        if (eCh === "e" || eCh === "E") {
          var save = i;
          i++;
          var sign = src.charAt(i);
          if (sign === "+" || sign === "-") { i++; }
          if (isDigit(src.charAt(i))) {
            while (i < n && isDigit(src.charAt(i))) { i++; }
          } else {
            i = save;   /* 不是合法的指数，回退（例如 temp*e） */
          }
        }
        out.push({ k: "num", v: parseFloat(src.slice(start, i)) });
        continue;
      }

      /* 标识符（通道名 / 常量 / 函数名） */
      if (isAlpha(ch)) {
        var s0 = i;
        while (i < n && isAlnum(src.charAt(i))) { i++; }
        out.push({ k: "ident", v: src.slice(s0, i) });
        continue;
      }

      if ("+-*/^%(),".indexOf(ch) >= 0) {
        out.push({ k: ch === "(" ? "lparen" : (ch === ")" ? "rparen" : (ch === "," ? "comma" : "op")), v: ch });
        i++;
        continue;
      }

      return { err: "表达式含非法字符「" + ch + "」" };
    }
    return { tokens: out };
  }

  /* ---------------- 调度场算法：中缀 → RPN ---------------- */
  function toRPN(tokens, varNames) {
    var out = [];
    var ops = [];
    var usedVars = {};
    var prev = null;   /* 上一个 token，用于判断一元正负号 */

    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];

      if (t.k === "num") {
        out.push(t);
      } else if (t.k === "ident") {
        var name = t.v;
        var nextTok = tokens[i + 1];

        /* 函数调用：标识符后面紧跟左括号 */
        if (nextTok && nextTok.k === "lparen") {
          if (!FUNCS[name]) { return { err: "不支持的函数「" + name + "」" }; }
          ops.push({ k: "fn", v: name });
        } else if (Object.prototype.hasOwnProperty.call(CONSTS, name.toLowerCase())
                   && (!varNames || varNames.indexOf(name) < 0)) {
          /* pi / e 是保留常量；但如果调用方明确把某个通道命名为 pi/e，则按变量处理 */
          out.push({ k: "num", v: CONSTS[name.toLowerCase()] });
        } else {
          /* 变量：必须在调用方给出的白名单里（挡住 alert(1) 这类未绑定标识符） */
          if (varNames && varNames.indexOf(name) < 0) {
            return { err: "未知变量「" + name + "」（可用通道："
              + (varNames.length ? varNames.join("、") : "无") + "）" };
          }
          usedVars[name] = true;
          out.push({ k: "var", v: name });
        }
      } else if (t.k === "op") {
        var op = t.v;
        /* 一元正负号判定：表达式开头 / 左括号后 / 逗号后 / 运算符后 */
        var isUnary = (prev === null || prev.k === "lparen" || prev.k === "comma" || prev.k === "op");
        if (isUnary && (op === "-" || op === "+")) { op = op === "-" ? "u-" : "u+"; }

        while (ops.length) {
          var top = ops[ops.length - 1];
          if (top.k !== "op") { break; }
          var p1 = PREC[op], p2 = PREC[top.v];
          if (p2 > p1 || (p2 === p1 && !RIGHT_ASSOC[op])) {
            out.push(ops.pop());
          } else { break; }
        }
        ops.push({ k: "op", v: op });
      } else if (t.k === "lparen") {
        ops.push(t);
      } else if (t.k === "comma") {
        var found = false;
        while (ops.length) {
          var tp = ops[ops.length - 1];
          if (tp.k === "lparen") { found = true; break; }
          out.push(ops.pop());
        }
        if (!found) { return { err: "括号不匹配（多余的逗号）" }; }
      } else if (t.k === "rparen") {
        var okParen = false;
        while (ops.length) {
          var tq = ops[ops.length - 1];
          if (tq.k === "lparen") { ops.pop(); okParen = true; break; }
          out.push(ops.pop());
        }
        if (!okParen) { return { err: "括号不匹配（缺少左括号）" }; }
        if (ops.length && ops[ops.length - 1].k === "fn") { out.push(ops.pop()); }
      }

      prev = t;
    }

    while (ops.length) {
      var rest = ops.pop();
      if (rest.k === "lparen") { return { err: "括号不匹配（缺少右括号）" }; }
      out.push(rest);
    }
    if (!out.length) { return { err: "表达式为空" }; }

    var varList = [];
    for (var vn in usedVars) { if (Object.prototype.hasOwnProperty.call(usedVars, vn)) { varList.push(vn); } }
    return { out: out, vars: varList };
  }

  /* ---------------- RPN 求值 ---------------- */
  function evalRPN(rpn, vars) {
    var st = [];
    for (var i = 0; i < rpn.length; i++) {
      var t = rpn[i];
      if (t.k === "num") {
        st.push(t.v);
      } else if (t.k === "var") {
        var raw = vars ? vars[t.v] : undefined;
        st.push(typeof raw === "number" && isFinite(raw) ? raw : 0);
      } else if (t.k === "op") {
        if (t.v === "u-" || t.v === "u+") {
          var a = st.pop();
          st.push(t.v === "u-" ? -a : +a);
        } else {
          var b = st.pop();
          var a2 = st.pop();
          if (a2 === undefined || b === undefined) { return NaN; }
          switch (t.v) {
            case "+": st.push(a2 + b); break;
            case "-": st.push(a2 - b); break;
            case "*": st.push(a2 * b); break;
            case "/": st.push(b === 0 ? NaN : a2 / b); break;
            case "%": st.push(b === 0 ? NaN : a2 % b); break;
            case "^": st.push(Math.pow(a2, b)); break;
            default: return NaN;
          }
        }
      } else if (t.k === "fn") {
        var spec = FUNCS[t.v];
        if (!spec) { return NaN; }
        var args = [];
        for (var j = 0; j < spec.n; j++) { args.unshift(st.pop()); }
        for (var q = 0; q < args.length; q++) {
          if (args[q] === undefined) { return NaN; }
        }
        st.push(spec.f.apply(null, args));
      }
    }
    if (st.length !== 1) { return NaN; }
    return st[0];
  }

  /* ---------------- 对外接口 ---------------- */
  /* compile(src, varNames) -> { ok, fn, vars, err }
     varNames：允许出现的变量名数组（传 null 表示不校验变量名，仅内部使用） */
  E.compile = function (src, varNames) {
    var s = String(src === null || src === undefined ? "" : src).trim();
    if (!s) { return { ok: false, err: "表达式为空", fn: null }; }

    var lexed = lex(s);
    if (lexed.err) { return { ok: false, err: lexed.err, fn: null }; }

    var rpn = toRPN(lexed.tokens, varNames || null);
    if (rpn.err) { return { ok: false, err: rpn.err, fn: null }; }

    return {
      ok: true,
      err: "",
      vars: rpn.vars,
      fn: function (vars) { return evalRPN(rpn.out, vars); }
    };
  };

  /* 一次性求值（便捷函数） */
  E.evalOnce = function (src, vars, varNames) {
    var c = E.compile(src, varNames || (vars ? Object.keys(vars) : []));
    if (!c.ok) { return { ok: false, err: c.err, value: NaN }; }
    var v = c.fn(vars || {});
    if (!isFinite(v)) { return { ok: false, err: "计算结果非有限值", value: NaN }; }
    return { ok: true, err: "", value: v };
  };

  SL.expr = E;

  /* UMD 尾：供校验脚本 require 真实源文件 */
  if (typeof module !== "undefined" && module.exports) { module.exports = SL.expr; }
})(typeof window !== "undefined" ? window : globalThis);
