/* ============================================================
   人形机器人学习站 · 个人作品台共享图形引擎(_assets/pf-kit.js)
   零依赖 WebGL1 样板 + 渲染调度(视口外暂停 / FPS / reduced-motion)
   使用方: 08_学习工具/14_个人作品台.html 与 _作品/ 下 4 个作品页
   ============================================================ */
(function(){
  "use strict";
  var REDUCED = false;
  try{ REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){}

  /* 创建 WebGL 全屏三画布程序。fragSrc 为完整片元着色器源码;
     extraUniforms 为除 uRes/uT 外的 uniform 名数组。
     返回 { gl, U, resize, draw } 或 null(WebGL 不可用/编译失败) */
  function glCanvas(canvas, fragSrc, extraUniforms){
    var gl = canvas.getContext("webgl", { antialias:false, alpha:false }) ||
             canvas.getContext("experimental-webgl", { antialias:false, alpha:false });
    if(!gl) return null;
    var VS = "attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.,1.);}";
    function sh(type, src){
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
        console.warn("[pf-kit] shader 编译失败:", gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }
    var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, fragSrc);
    if(!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog, gl.LINK_STATUS)){
      console.warn("[pf-kit] program 链接失败:", gl.getProgramInfoLog(prog));
      return null;
    }
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {};
    var names = ["uRes","uT"].concat(extraUniforms || []);
    for(var i = 0; i < names.length; i++) U[names[i]] = gl.getUniformLocation(prog, names[i]);
    /* 上下文丢失自恢复:长时间开很多 GL 页面时浏览器会回收上下文,
       默认行为是静默黑屏;这里显式提示并支持恢复后继续渲染 */
    canvas.addEventListener("webglcontextlost", function(e){
      e.preventDefault();
      console.warn("[pf-kit] WebGL 上下文丢失,等待恢复");
    }, false);
    canvas.addEventListener("webglcontextrestored", function(){
      console.warn("[pf-kit] WebGL 上下文已恢复,请刷新页面重建程序");
    }, false);
    return {
      gl: gl, U: U,
      resize: function(){
        var dpr = Math.min(window.devicePixelRatio || 1, 1.6);
        var w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
        if(canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; }
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(prog);
        gl.uniform2f(U.uRes, canvas.width, canvas.height);
      },
      draw: function(t){
        gl.useProgram(prog);
        gl.uniform1f(U.uT, t);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    };
  }

  /* 渲染调度:首帧同步保底(嵌入式合成器 rAF/IO 初报不可靠时绝不空屏);
     IO 视口外暂停 + 看门狗自恢复;FPS 显示;reduced-motion 只渲染一帧。
     renderFn(t) 每帧调用,t 为秒。返回 { wake() } 供外部在参数变化时补帧。 */
  function loop(canvas, fpsEl, renderFn){
    var visible = true, raf = null, t0 = performance.now(), frames = 0, lastFps = t0, lastRender = 0;
    var failed = false;
    function frame(now){
      raf = null;
      if(!visible) return;
      var t = (now - t0) / 1000;
      try{ renderFn(t); }
      catch(e){
        failed = true;
        if(fpsEl) fpsEl.textContent = "渲染异常: " + (e && e.message || e);
        return;
      }
      lastRender = now;
      frames++;
      if(fpsEl && now - lastFps > 800){
        fpsEl.textContent = Math.round(frames * 1000 / (now - lastFps)) + " fps";
        frames = 0; lastFps = now;
      }
      raf = requestAnimationFrame(frame);
    }
    function kick(){ if(raf === null && visible){ raf = requestAnimationFrame(frame); } }
    if("IntersectionObserver" in window){
      new IntersectionObserver(function(es){
        for(var i = 0; i < es.length; i++){
          visible = es[i].isIntersecting;
          if(visible) kick();
        }
      }, { threshold: 0.02 }).observe(canvas);
    }
    if(REDUCED){ renderFn(1.5); return { wake: function(){ renderFn(1.5); } }; }
    /* 首帧同步渲染:IO/rAF 未就绪也保证画面非空 */
    try{ renderFn(0); lastRender = performance.now(); }
    catch(e){
      failed = true;
      if(fpsEl) fpsEl.textContent = "渲染异常: " + (e && e.message || e);
    }
    /* 看门狗:rAF 被合成器饿死或 IO 误报时自恢复(仅页面可见时) */
    setInterval(function(){
      if(document.hidden) return;
      if(raf === null && performance.now() - lastRender > 900){
        visible = true;
        kick();
      }
    }, 900);
    kick();
    return { wake: kick };
  }

  /* 公共 fbm 噪声 GLSL 片段(hash/noise/fbm),供各作品拼接 */
  var NOISE_GLSL =
    "float hash(float n){return fract(sin(n)*43758.5453123);}\n" +
    "float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);\n" +
    " float a=hash(i.x+i.y*57.),b=hash(i.x+1.+i.y*57.),c=hash(i.x+(i.y+1.)*57.),d=hash(i.x+1.+(i.y+1.)*57.);\n" +
    " return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}\n" +
    "float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.03;a*=.5;}return v;}\n";

  return { glCanvas: glCanvas, loop: loop, reduced: REDUCED, NOISE_GLSL: NOISE_GLSL };
})();
