/* ============================================================
   chibi-robot.js — 「ROBO-Q 雪白小机器人」v7 · 白室展台
   v7 变更:云朵体积感重塑(六簇带压扁,轮廓更蓬)、天气与飘雪逻辑一致化
   (雪天才有环境雪/雨天雷天才落雨滴,晴天彻底干净)、雨滴圆柱化、
   天线随呼吸摆动、移除悬浮提示(注脚统一由页面 stage-note 提供)。
   洁白皮肤 + 头顶小天气(❄️雪(默认) ☀️晴 🌧雨 ⛈雷,与表情联动,
   自动轮换 12s,点击机器人立即切换)。眼睛常驻追踪全页鼠标;
   拖拽环视;离屏/切页签暂停;reduced-motion 静态降级。
   页面侧:动态加载 three 后调用 window.ChibiRobot.mount(el, THREE, opts)
   ============================================================ */
(function(){
"use strict";

function roundedBox(THREE, w, h, d, seg, r){
  var g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  var pos = g.attributes.position, nor = g.attributes.normal;
  var hw = w/2 - r, hh = h/2 - r, hd = d/2 - r;
  var v = new THREE.Vector3(), c = new THREE.Vector3(), dir = new THREE.Vector3();
  for(var i = 0; i < pos.count; i++){
    v.fromBufferAttribute(pos, i);
    c.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
    dir.copy(v).sub(c);
    if(dir.lengthSq() > 1e-10){
      dir.normalize();
      pos.setXYZ(i, c.x + dir.x*r, c.y + dir.y*r, c.z + dir.z*r);
      nor.setXYZ(i, dir.x, dir.y, dir.z);
    }
  }
  return g;
}
function shadowTexture(THREE){
  var cv = document.createElement("canvas"); cv.width = cv.height = 128;
  var ctx = cv.getContext("2d");
  var g = ctx.createRadialGradient(64,64,6,64,64,60);
  g.addColorStop(0, "rgba(70,96,140,.38)"); g.addColorStop(1, "rgba(70,96,140,0)");
  ctx.fillStyle = g; ctx.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(cv);
}
function heartTexture(THREE, color){
  var S = 64, cv = document.createElement("canvas"); cv.width = cv.height = S;
  var ctx = cv.getContext("2d");
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(S/2, S*0.86);
  ctx.bezierCurveTo(S*0.02, S*0.52, S*0.16, S*0.10, S/2, S*0.32);
  ctx.bezierCurveTo(S*0.84, S*0.10, S*0.98, S*0.52, S/2, S*0.86);
  ctx.fill();
  return new THREE.CanvasTexture(cv);
}
function flakeTexture(THREE){
  var S = 48, cv = document.createElement("canvas"); cv.width = cv.height = S;
  var ctx = cv.getContext("2d");
  ctx.strokeStyle = "rgba(200,222,250,.95)"; ctx.lineWidth = 3; ctx.lineCap = "round";
  for(var i = 0; i < 3; i++){
    var a = i*Math.PI/3;
    ctx.beginPath();
    ctx.moveTo(S/2 - Math.cos(a)*S*0.36, S/2 - Math.sin(a)*S*0.36);
    ctx.lineTo(S/2 + Math.cos(a)*S*0.36, S/2 + Math.sin(a)*S*0.36);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(cv);
}

/* 天气:雪为默认(与洁白皮肤呼应),表情一一对应 */
var WEATHERS = [
  { id:"snow",    emoji:"❄️", name:"下雪", ant:0x9fdcff, bend:-0.012, ws:0.9,  eyeSY:1.0,  eyeY:0,     headTX:0,    droop:0    },
  { id:"sun",     emoji:"☀️", name:"晴天", ant:0xffd733, bend:-0.028, ws:1.15, eyeSY:1.0,  eyeY:0,     headTX:0,    droop:0    },
  { id:"rain",    emoji:"🌧", name:"下雨", ant:0x8fa8c8, bend: 0.028, ws:0.85, eyeSY:0.78, eyeY:-0.009,headTX:0.06, droop:0.3  },
  { id:"thunder", emoji:"⛈", name:"打雷", ant:0xc9a6ff, bend:-0.005, ws:0.55, eyeSY:1.22, eyeY:0,     headTX:0,    droop:0    }
];

function mount(el, THREE, opts){
  opts = opts || {};
  if(!el || !THREE || el.__chibi) return null;
  el.__chibi = true;

  var renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  renderer.setSize(Math.max(el.clientWidth,120), Math.max(el.clientHeight,120));
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;cursor:grab";
  el.appendChild(renderer.domElement);
  var cv = renderer.domElement;

  var scene = new THREE.Scene();
  var cam = new THREE.PerspectiveCamera(36, 2, 0.05, 40);
  cam.position.set(0.05, 0.82, 2.42);
  cam.lookAt(0, 0.5, 0);

  var hasEnv = false;
  if(opts.RoomEnvironment){
    try{
      var pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new opts.RoomEnvironment(), 0.04).texture;
      pmrem.dispose(); hasEnv = true;
    }catch(e){}
  }

  var hemi = new THREE.HemisphereLight(0xffffff, 0xdce6f5, 0.85); scene.add(hemi);
  var key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(1.3, 1.8, -1.2); scene.add(key);
  var rimL = new THREE.DirectionalLight(0xdbeaff, 0.55); rimL.position.set(-1.2, 1.6, 1.4); scene.add(rimL);
  /* 正面补光:key 光在机器人背后,正对相机的面几乎只吃环境贴图;环境贴图一旦缺失
     (file:// 直开时本地模块 import 被 CORS 拦截、RoomEnvironment 加载失败),
     机器人正面就会发灰发黑。补光常驻;检测到无环境贴图时再整体提灯,
     保证任何加载路径下机器人都是洁白的 */
  var fill = new THREE.DirectionalLight(0xffffff, 0.85); fill.position.set(0.4, 1.1, 2.3); scene.add(fill);
  if(!hasEnv){
    fill.intensity = 1.7;
    hemi.intensity = 1.15;
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  }

  /* ---------- 洁白材质 ---------- */
  var mWhite = new THREE.MeshPhysicalMaterial({ color:0xf8f5ef, roughness:0.36, metalness:0.0, clearcoat:0.45, clearcoatRoughness:0.45, envMapIntensity:0.7 });
  var mCyan  = new THREE.MeshPhysicalMaterial({ color:0x7cc4f0, roughness:0.3,  metalness:0.1, clearcoat:0.4, envMapIntensity:0.8 });
  var mDark  = new THREE.MeshStandardMaterial({ color:0x4a5568, roughness:0.45 });
  var mHeart = new THREE.MeshPhysicalMaterial({ color:0xff8fa3, roughness:0.35, clearcoat:0.4, emissive:0xff5f7e, emissiveIntensity:0.55 });
  var mBlush = new THREE.MeshStandardMaterial({ color:0xffb8c8, roughness:0.6, transparent:true, opacity:0.75 });
  var mEyeBall = new THREE.MeshStandardMaterial({ color:0x18202e, roughness:0.3 });
  var mEyeGl = new THREE.MeshStandardMaterial({ color:0x0d3a46, emissive:0x49e4ff, emissiveIntensity:1.6 });
  var mGlint = new THREE.MeshBasicMaterial({ color:0xffffff });
  var mPed   = new THREE.MeshPhysicalMaterial({ color:0xf4f8fe, roughness:0.35, clearcoat:0.5, envMapIntensity:0.7 });

  var root = new THREE.Group(); scene.add(root);

  function RB(w,h,d,r){ return roundedBox(THREE, w, h, d, 6, r); }
  function mesh(geo, mat2, parent, x, y, z){
    var m = new THREE.Mesh(geo, mat2);
    m.position.set(x||0, y||0, z||0);
    parent.add(m);
    return m;
  }

  /* ---------- 雪白展台 ---------- */
  var ped = new THREE.Group(); root.add(ped);
  var disc = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.34, 0.06, 56), mPed);
  disc.position.y = 0.03; ped.add(disc);
  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.008, 12, 72),
    new THREE.MeshStandardMaterial({ color:0x9fd4f5, roughness:0.3, emissive:0x9fd4f5, emissiveIntensity:0.25 }));
  ring.rotation.x = Math.PI/2; ring.position.y = 0.062; ped.add(ring);
  var shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0),
    new THREE.MeshBasicMaterial({ map: shadowTexture(THREE), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI/2; shadow.position.y = 0.004; ped.add(shadow);

  /* ---------- 机器人(洁白皮肤) ---------- */
  var robot = new THREE.Group(); robot.position.y = 0.06; ped.add(robot);
  /* 腿脚 */
  mesh(new THREE.SphereGeometry(0.03, 18, 12), mDark, robot, -0.075, 0.128, -0.02);
  mesh(new THREE.SphereGeometry(0.03, 18, 12), mDark, robot,  0.075, 0.128, -0.02);
  mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.075, 28), mWhite, robot, -0.075, 0.172, -0.02);
  mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.075, 28), mWhite, robot,  0.075, 0.172, -0.02);
  mesh(RB(0.095, 0.05, 0.12, 0.022), mCyan, robot, -0.078, 0.075, -0.02);
  mesh(RB(0.095, 0.05, 0.12, 0.022), mCyan, robot,  0.078, 0.075, -0.02);
  /* 颈椎 + 身体 */
  mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.035, 24), mDark, robot, 0, 0.202, -0.01);
  mesh(RB(0.2625, 0.25, 0.2375, 0.055), mWhite, robot, 0, 0.33, -0.01);
  /* 胸口爱心 */
  mesh(new THREE.SphereGeometry(0.021, 24, 16), mHeart, robot, -0.013, 0.338, 0.108);
  mesh(new THREE.SphereGeometry(0.021, 24, 16), mHeart, robot,  0.013, 0.338, 0.108);
  var heartTip = mesh(RB(0.026, 0.026, 0.016, 0.006), mHeart, robot, 0, 0.312, 0.108);
  heartTip.rotation.z = Math.PI/4;
  /* 手臂 */
  function arm(side){
    var pivot = new THREE.Group();
    pivot.position.set(0.148*side, 0.43, -0.005);
    pivot.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 14), mDark));
    var seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.024, 0.125, 28), mWhite);
    seg2.rotation.z = side * 1.22;
    seg2.position.set(0.052*side, -0.036, 0);
    pivot.add(seg2);
    var hand = new THREE.Mesh(new THREE.SphereGeometry(0.036, 24, 16), mCyan);
    hand.position.set(0.098*side, -0.062, 0);
    pivot.add(hand);
    robot.add(pivot);
    return pivot;
  }
  var armL = arm(-1), armR = arm(1);
  /* 头 */
  var head = new THREE.Group(); head.position.set(0, 0.585, 0.01); robot.add(head);
  head.add(new THREE.Mesh(RB(0.3876, 0.38, 0.361, 0.078), mWhite));
  var antenna = new THREE.Group(); antenna.position.set(0, 0.19, 0); head.add(antenna);
  var antRod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.07, 20), mDark);
  antRod.position.y = 0.035; antenna.add(antRod);
  var antBall = new THREE.Mesh(new THREE.SphereGeometry(0.026, 24, 16), mDark);
  antBall.position.y = 0.08; antenna.add(antBall);
  var antDot = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8),
    new THREE.MeshStandardMaterial({ color:0xffffff, emissive:0x9fdcff, emissiveIntensity:1.2 }));
  antDot.position.y = 0.095; antenna.add(antDot);
  var earGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.042, 40);
  var earL = new THREE.Mesh(earGeo, mCyan); earL.rotation.z = Math.PI/2; earL.position.set(-0.212, 0, 0.005); head.add(earL);
  var earR = new THREE.Mesh(earGeo, mCyan); earR.rotation.z = Math.PI/2; earR.position.set( 0.212, 0, 0.005); head.add(earR);
  /* 脸 */
  var face = new THREE.Group(); head.add(face);
  var sockL = new THREE.Mesh(new THREE.CircleGeometry(0.066, 40), mEyeBall); sockL.position.set(-0.088, 0.022, 0.176); face.add(sockL);
  var sockR = new THREE.Mesh(new THREE.CircleGeometry(0.066, 40), mEyeBall); sockR.position.set( 0.088, 0.022, 0.176); face.add(sockR);
  var eyeL = new THREE.Mesh(new THREE.CircleGeometry(0.052, 40), mEyeGl); eyeL.position.set(-0.088, 0.022, 0.182); face.add(eyeL);
  var eyeR = new THREE.Mesh(new THREE.CircleGeometry(0.052, 40), mEyeGl); eyeR.position.set( 0.088, 0.022, 0.182); face.add(eyeR);
  var glL = new THREE.Mesh(new THREE.CircleGeometry(0.016, 20), mGlint); glL.position.set(-0.076, 0.038, 0.188); face.add(glL);
  var glR = new THREE.Mesh(new THREE.CircleGeometry(0.016, 20), mGlint); glR.position.set( 0.076, 0.038, 0.188); face.add(glR);
  var blL = new THREE.Mesh(new THREE.CircleGeometry(0.027, 24), mBlush); blL.position.set(-0.152, -0.042, 0.178); face.add(blL);
  var blR = new THREE.Mesh(new THREE.CircleGeometry(0.027, 24), mBlush); blR.position.set( 0.152, -0.042, 0.178); face.add(blR);
  var smile = null;
  function buildSmile(bend, widthScale){
    if(smile){ face.remove(smile); smile.geometry.dispose(); }
    var w = 0.042*widthScale;
    var curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-w, -0.058 + bend, 0.181),
      new THREE.Vector3( 0,  -0.058 + bend*2.2, 0.188),
      new THREE.Vector3( w,  -0.058 + bend, 0.181)
    );
    smile = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.006, 10, false), mDark);
    face.add(smile);
  }

  /* ---------- 头顶天气云 ☁️ v7:六簇带压扁的体积云,轮廓蓬松、底部收平 ----------
     雪为默认(与洁白皮肤呼应);雨/雷时云变深 */
  var cloudGrp = new THREE.Group(); cloudGrp.position.set(0, 1.0, 0); cloudGrp.scale.set(1.22, 1.06, 1.22); robot.add(cloudGrp);
  var mCloudSnow = new THREE.MeshStandardMaterial({ color:0xfdfbf7, roughness:0.85, metalness:0.02 });
  var mCloudRain = new THREE.MeshStandardMaterial({ color:0x9fb0c8, roughness:0.7 });
  var mCloudThunder = new THREE.MeshStandardMaterial({ color:0x6f7d96, roughness:0.66 });
  /* [x, y, z, r]:中间最高,两翼渐低,底部两簇下沉收平 */
  [[-0.062, 0.012, 0.058, 0.050],[ -0.012, 0.046, 0.062, 0.058],[0.048, 0.020, 0.058, 0.052],
   [0.088, -0.014, 0.048, 0.042],[0.012, -0.024, 0.056, 0.046],[-0.046, -0.022, 0.048, 0.042]]
  .forEach(function(c){
    var s = new THREE.Mesh(new THREE.SphereGeometry(c[3], 22, 16), mCloudSnow);
    s.position.set(c[0], c[1], 0); cloudGrp.add(s);
  });
  var sunGrp = new THREE.Group(); sunGrp.visible = false; cloudGrp.add(sunGrp);
  var mSun = new THREE.MeshBasicMaterial({ color: 0xffd733 });
  sunGrp.add(new THREE.Mesh(new THREE.SphereGeometry(0.048, 24, 16), mSun));
  var rayGeo = new THREE.BoxGeometry(0.008, 0.034, 0.008);
  for(var ri = 0; ri < 8; ri++){
    var ray = new THREE.Mesh(rayGeo, mSun);
    var ra = ri/8*Math.PI*2;
    ray.position.set(Math.cos(ra)*0.078, Math.sin(ra)*0.078, 0);
    ray.rotation.z = ra + Math.PI/2;
    sunGrp.add(ray);
  }
  var drops = [], mDrop = new THREE.MeshBasicMaterial({ color:0x8fb8e8, transparent:true, opacity:0.62 });
  var dropGeo = new THREE.CylinderGeometry(0.0032, 0.0042, 0.055, 8);
  for(var di = 0; di < 12; di++){
    var d = new THREE.Mesh(dropGeo, mDrop);
    d.position.set((Math.random()-0.5)*0.2, -0.04 - Math.random()*0.28, 0.16);
    d.userData.v = 0.5 + Math.random()*0.3;
    cloudGrp.add(d); drops.push(d);
  }
  var flakes = [], flakeTex = flakeTexture(THREE);
  for(var si = 0; si < 16; si++){
    var fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flakeTex, transparent: true, opacity: 0.92, depthWrite: false }));
    fl.scale.setScalar(0.021 + Math.random()*0.016);
    fl.position.set((Math.random()-0.5)*0.22, -0.04 - Math.random()*0.28, 0.16);
    fl.userData.v = 0.14 + Math.random()*0.1;
    fl.userData.ph = Math.random()*6.28;
    cloudGrp.add(fl); flakes.push(fl);
  }
  /* 常态环境飘雪(贯穿整个舞台,雪白主题氛围) */
  var ambient = [];
  for(var ai = 0; ai < 26; ai++){
    var af = new THREE.Sprite(new THREE.SpriteMaterial({ map: flakeTex, transparent: true, opacity: 0.55 + Math.random()*0.35, depthWrite: false }));
    af.scale.setScalar(0.017 + Math.random()*0.02);
    af.position.set((Math.random()-0.5)*3.0, Math.random()*1.6, (Math.random()-0.5)*1.2);
    af.userData.v = 0.1 + Math.random()*0.12;
    af.userData.ph = Math.random()*6.28;
    root.add(af); ambient.push(af);
  }
  var mBolt = new THREE.MeshBasicMaterial({ color: 0xeaf2ff, transparent: true, opacity: 0 });
  var bolt = (function(){
    var pts = [ new THREE.Vector3(0.03, -0.02, 0.16) ];
    var cur = pts[0].clone();
    for(var k = 0; k < 4; k++){
      cur = cur.clone(); cur.x += (k%2===0 ? -0.04 : 0.032); cur.y -= 0.07;
      pts.push(cur);
    }
    var b = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.005, 8, false), mBolt);
    cloudGrp.add(b);
    return b;
  })();

  /* ---------- 天气状态机(默认下雪) ---------- */
  var badge = document.createElement("i");
  badge.className = "chibi-badge";   /* 配色走页面 CSS 双主题类,内联只管定位 */
  badge.style.cssText = "position:absolute;left:12px;top:10px;font-style:normal;font-size:10px;letter-spacing:.18em;pointer-events:none;border-radius:999px;padding:2px 9px;border:1px solid transparent";
  el.appendChild(badge);
  var wxI = 0, wxT = 0, flashT = 1.5;
  function applyWeather(idx){
    wxI = idx % WEATHERS.length;
    var wd = WEATHERS[wxI];
    var sunny = wd.id === "sun";
    cloudGrp.visible = !sunny;
    sunGrp.visible = sunny;
    /* 云色随天气 */
    var cm = wd.id === "rain" ? mCloudRain : (wd.id === "thunder" ? mCloudThunder : mCloudSnow);
    for(var ci = 0; ci < cloudGrp.children.length; ci++){
      var ch = cloudGrp.children[ci];
      if(ch.material === mCloudSnow || ch.material === mCloudRain || ch.material === mCloudThunder) ch.material = cm;
    }
    drops.forEach(function(dp){ dp.visible = wd.id === "rain" || wd.id === "thunder"; });
    flakes.forEach(function(fk){ fk.visible = wd.id === "snow"; });
    /* v7 天气逻辑一致化:环境雪只属于雪天,晴天彻底干净 */
    ambient.forEach(function(af){ af.visible = wd.id === "snow"; });
    if(badge) badge.textContent = wd.emoji + " " + wd.name;
    buildSmile(wd.bend, wd.ws);
    st.eyeSY = wd.eyeSY; st.eyeY = wd.eyeY; st.headTX = wd.headTX; st.droop = wd.droop;
  }

  /* ---------- 交互 ---------- */
  var st = { mx:0, my:0, hover:false, vy:0, jumpY:0, dragY:0, dragging:false,
             blinkT:2.6+Math.random()*2, blinkK:0, visible:true, hidden:false, disposed:false,
             eyeSY:1, eyeY:0, headTX:0, droop:0 };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  window.addEventListener("pointermove", function(e){
    var r = cv.getBoundingClientRect();
    st.mx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width/2)) / (r.width*0.9)));
    st.my = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height/2)) / (r.height*0.9)));
  }, { passive: true });
  el.addEventListener("pointerenter", function(){ st.hover = true; cv.style.cursor = "pointer"; });
  el.addEventListener("pointerleave", function(){ st.hover = false; st.dragging = false; cv.style.cursor = "grab"; });
  cv.addEventListener("pointerdown", function(e){
    st.dragging = true; st.dragX0 = e.clientX; st.dragY0 = st.dragY;
    try{ cv.setPointerCapture(e.pointerId); }catch(err){}
  });
  cv.addEventListener("pointermove", function(e){
    if(!st.dragging) return;
    st.dragY = Math.max(-0.9, Math.min(0.9, st.dragY0 + (e.clientX - st.dragX0)*0.012));
  });
  cv.addEventListener("pointerup", function(){ st.dragging = false; });
  cv.addEventListener("click", function(){
    st.vy = 0.036;   /* V2.1.29:峰值 0.27→0.14,修"跳起后头顶云朵越出画面消失" */
    wxI = (wxI + 1) % WEATHERS.length; wxT = 0;
    applyWeather(wxI);
    spawnHearts();
  });

  var hearts = [], heartTex = heartTexture(THREE, "#ff9db8");
  function spawnHearts(){
    for(var i = 0; i < 5; i++){
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, opacity: 0.95, depthWrite: false }));
      s.scale.setScalar(0.042 + Math.random()*0.032);
      s.position.set((Math.random()-0.5)*0.3, 0.58 + Math.random()*0.1, 0.2);
      s.userData.vy = 0.45 + Math.random()*0.3;
      s.userData.vx = (Math.random()-0.5)*0.18;
      s.userData.life = 0;
      root.add(s); hearts.push(s);
    }
  }

  var clock = new THREE.Clock();
  var targetW = 0, targetH = 0;
  function onResize(){
    var w = Math.max(el.clientWidth, 120), h = Math.max(el.clientHeight, 120);
    if(w === targetW && h === targetH) return;
    targetW = w; targetH = h;
    renderer.setSize(w, h);
    cam.aspect = w/h; cam.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);
  var io = null;
  if("IntersectionObserver" in window){
    io = new IntersectionObserver(function(en){ st.visible = en[0] && en[0].isIntersecting; }, { threshold: 0.02 });
    io.observe(el);
  }
  document.addEventListener("visibilitychange", function(){ st.hidden = document.hidden; });

  var t = 0, blinkWait = st.blinkT;

  function frame(){
    if(st.disposed) return;
    requestAnimationFrame(frame);
    if(st.hidden || !st.visible) return;
    var dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    onResize();
    if(reduceMotion){ renderer.render(scene, cam); return; }

    var wd = WEATHERS[wxI];
    /* 天气自动轮换(12s,悠闲节奏) */
    wxT += dt;
    if(wxT > 12){ wxT = 0; wxI = (wxI + 1) % WEATHERS.length; applyWeather(wxI); }
    /* 雷:周期闪电视觉 */
    if(wd.id === "thunder"){
      flashT -= dt;
      if(flashT <= 0){ flashT = 1.8 + Math.random()*2.6; mBolt.opacity = 1; st.vy = Math.max(st.vy, 0.014); }
      mBolt.opacity = Math.max(0, mBolt.opacity - dt*4);
    }
    /* 云飘 / 太阳转 / 雨落 / 雪飘 */
    cloudGrp.position.y = 0.97 + Math.sin(t*1.1)*0.009;
    cloudGrp.rotation.y = Math.sin(t*0.5)*0.08;
    sunGrp.rotation.z = t*0.6;
    for(var d2 = 0; d2 < drops.length; d2++){
      var dp = drops[d2];
      if(!dp.visible) continue;
      dp.position.y -= dp.userData.v*dt;
      if(dp.position.y < -0.32) dp.position.y = -0.02;
    }
    for(var f2 = 0; f2 < flakes.length; f2++){
      var fk = flakes[f2];
      if(!fk.visible) continue;
      fk.position.y -= fk.userData.v*dt;
      fk.position.x += Math.sin(t*1.4 + fk.userData.ph)*0.0005;
      if(fk.position.y < -0.32) fk.position.y = -0.02;
    }
    /* 常态环境飘雪 */
    for(var a2i = 0; a2i < ambient.length; a2i++){
      var af = ambient[a2i];
      af.position.y -= af.userData.v*dt;
      af.position.x += Math.sin(t*0.8 + af.userData.ph)*0.0008;
      if(af.position.y < 0.02) af.position.y = 1.6;
    }

    /* 机器人待机 */
    var breathe = 1 + Math.sin(t*2.1)*0.008;
    st.jumpY += st.vy; st.vy -= 0.28*dt;
    if(st.jumpY <= 0){ st.jumpY = 0; st.vy = 0; }
    robot.position.y = 0.06 + st.jumpY + Math.sin(t*1.5)*0.006;
    cloudGrp.position.y = 1.0 - st.jumpY*0.55;   /* 云朵反向跟随:跳跃时滞留画面内,自带拖尾感 */
    robot.scale.setScalar(0.9*Math.sqrt(breathe));
    if(!st.dragging) st.dragY += (0 - st.dragY)*Math.min(1, dt*2.2);
    robot.rotation.y += (st.dragY*0.6 + st.mx*0.32 - robot.rotation.y)*Math.min(1, dt*4.5);
    head.rotation.y += ((st.dragY === 0 ? st.mx*0.3 : 0) - head.rotation.y)*Math.min(1, dt*4.5);
    head.rotation.x += (st.my*0.2 + st.headTX - head.rotation.x)*Math.min(1, dt*4.5);
    face.position.set(st.mx*0.014, -st.my*0.01, 0);
    eyeL.scale.y += (st.eyeSY - eyeL.scale.y)*Math.min(1, dt*6);
    eyeR.scale.y = eyeL.scale.y;
    eyeL.position.y += ((0.022 + st.eyeY) - eyeL.position.y)*Math.min(1, dt*6);
    eyeR.position.y = eyeL.position.y;
    if(wd.id !== "rain"){
      blinkWait -= dt;
      if(blinkWait <= 0){ blinkWait = 2.8 + Math.random()*2.6; st.blinkK = 1; }
    }
    if(st.blinkK > 0){
      st.blinkK -= dt*9;
      var k = Math.max(0, st.blinkK);
      var sy = k > 0.5 ? (1-k)*2 : k*2;
      eyeL.scale.y = eyeR.scale.y = Math.min(eyeL.scale.y, Math.max(0.06, sy));
      glL.visible = glR.visible = sy > 0.4;
    } else { eyeL.scale.y = eyeR.scale.y = Math.max(0.06, eyeL.scale.y); glL.visible = glR.visible = true; }
    var swing = Math.sin(t*1.5)*0.05 + (st.jumpY > 0.01 ? 0.5 : 0);
    armL.rotation.z =  swing*0.5 + (wd.id === "sun" ? Math.abs(Math.sin(t*6))*0.4 - 0.2 : 0) + st.droop;
    armR.rotation.z = -swing*0.5 - st.droop;
    antenna.rotation.z = Math.sin(t*1.7)*0.05;   /* v7:天线随呼吸轻摆 */
    antDot.material.emissiveIntensity = 1.0 + Math.sin(t*2.6)*0.5;
    mHeart.emissiveIntensity = 0.45 + Math.sin(t*3.2)*0.18;

    /* 爱心粒子 */
    for(var i = hearts.length-1; i >= 0; i--){
      var hp = hearts[i];
      hp.userData.life += dt;
      hp.position.y += hp.userData.vy*dt;
      hp.position.x += hp.userData.vx*dt;
      hp.material.opacity = Math.max(0, 0.95 - hp.userData.life*0.9);
      if(hp.material.opacity <= 0){ if(hp.parent) hp.parent.remove(hp); hp.material.dispose(); hearts.splice(i,1); }
    }

    renderer.render(scene, cam);
  }

  try{ applyWeather(0); }catch(e){ if(window.console) console.error("chibi applyWeather:", e); }
  onResize();
  frame();

  return {
    dispose: function(){
      st.disposed = true;
      if(io) io.disconnect();
      renderer.dispose();
      if(renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      if(badge.parentNode) badge.parentNode.removeChild(badge);
      el.__chibi = false;
    }
  };
}

window.ChibiRobot = { mount: mount };
})();
