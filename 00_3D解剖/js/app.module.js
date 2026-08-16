/* ============================================================
   人形机器人 3D 解剖知识系统 · 主逻辑模块(从主 HTML 拆分)
   拆分时间: 2026-08-16 · 二次拆分(E4): 机型配置/参数数据已移至 js/config.js，本文件仅保留逻辑
   由 importmap 解析 'three' / 'three/addons/' 依赖
   ============================================================ */
/* 【手机白屏修复】模块已启动：通知启动自检看门狗不再触发超时提示。
   注意：启动遮罩不在此时撤下——改为首次 showLoading/hideLoading 时撤下，
   以覆盖 three.module.js（约1.2MB）下载期间的无反馈窗口 */
window.__3D_BOOT_OK__=true;
/* E4 二次拆分：机型配置/参数数据独立成 js/config.js（导出名与原内联名一致，引用零改动） */
import { PROP, LABEL_FONT_SIZE, LABEL_PADDING, LABEL_BG_COLOR, LABEL_TEXT_COLOR, AUTO_ROTATE_SPEED,
  GAIT_PERIOD, GAIT_SMOOTH, GAIT_LEG_AMP, GAIT_KNEE_BASE, GAIT_KNEE_AMP, GAIT_ANKLE_AMP,
  GAIT_ARM_AMP, GAIT_ELBOW_BASE, GAIT_ELBOW_AMP, GAIT_WAIST_AMP, GAIT_BOB_AMP, CAMERA_DEFAULT_DIST,
  COLOR_SCHEMES, ENV_PRESETS, URDF_CFG, PART_COLORS,
  DRC_STL_ENABLE, GZ_STL_ENABLE, DRC_DECODE_TIMEOUT_MS, STL_MAX_RETRY, STL_CONCURRENCY,
  STL_RETRY_DELAY, PLACEHOLDER_SIZE, ROBOT_TARGET_H, FLOOR_Y, REDUCER_STL,
  PRELOAD_ROBOTS_DELAY, CMP_ORDER, CMP_NAMES, CMP_GAP, TD_SEQ_STEP, TD_SEQ_HOLD,
  TD_INFO, CYBER_ORBIT, TD_LBL_X
} from './config.js';
let THREE, OrbitControls, STLLoader=null, DRACOLoader=null, _dracoLoader=null;
let renderer, scene, camera, controls, body3d;
let raf=null, built=false, active=false;
/* partGroups: 部件键 -> 网格数组（真实 URDF 模型与回退模型统一用此结构） */
let partGroups={};
let currentModel='h1';  /* 默认机型：宇树 H1（与 RobotApp 的 curM 保持一致；X1 库太大改手动切换） */
let accentHex=0x2b8eff;
/* 机型比例/可调参数/步态参数等配置数据已移至 js/config.js（E4 拆分） */
let autoRotate=false;               /* 自动旋转开关 */
let globalWireframe=false;          /* 全局线框模式 */
let userInteracted=false;           /* 用户是否已拖动过视角：用于避免加载完成后相机被强行复位 */
let cameraInitTarget=null;          /* 初始相机目标点 */
let cameraInitPosition=null;        /* 初始相机位置 */
let cameraInitMinDist=45;           /* 初始最小缩放距离 */
let cameraInitMaxDist=220;          /* 初始最大缩放距离 */
let RoomEnv=null;                   /* RoomEnvironment 环境贴图生成类（loadDeps 异步加载） */

/* 机身配色方案 COLOR_SCHEMES 已移至 js/config.js（E4 拆分） */
let curScheme='dark';               /* 当前配色方案键（持久化到 localStorage） */
curScheme=restoreColorScheme();     /* 启动时恢复上次选择的配色方案（无记录则默认原配色） */

/* ==================== 环境背景预设系统（程序化生成，零外部下载，切换毫秒级） ====================
   默认"无环境"保持原始透明背景+网格地面；其余预设用 Canvas 渐变天空 + 柔和太阳 + 雾
   + 实体地面 + 灯光色温微调，营造"简单好看、稍微真实"的自然光/展厅氛围
   （预设数据 ENV_PRESETS 已移至 js/config.js，E4 拆分） */
let lightHemi=null,lightKey=null,lightFill=null;  /* 环境预设要调色的光源引用（initThree 赋值） */
let grid3d=null,gnd3d=null,gndShadowMat=null;     /* 地面网格/地面实体/透明阴影材质引用 */
let LIGHT_INIT=null;                              /* 主光+环境光初始参数（切回无环境时恢复） */
let curEnv='none';                                /* 当前环境预设键（持久化到 localStorage） */
/* 生成渐变天空 Canvas 纹理：stops 为从上到下的颜色数组，sun 为可选太阳光晕位置[x,y](0~1) */
function makeSkyTexture(stops,sun){
  var cv=document.createElement('canvas');cv.width=64;cv.height=256;   /* 窄条即可，纵向渐变横向均匀 */
  var ctx=cv.getContext('2d');
  var g=ctx.createLinearGradient(0,0,0,256);
  for(var i=0;i<stops.length;i++)g.addColorStop(i/(stops.length-1),stops[i]);
  ctx.fillStyle=g;ctx.fillRect(0,0,64,256);
  if(sun){   /* 太阳光晕：径向渐变白核+暖晕，叠在天空上部 */
    var sx=sun[0]*64,sy=sun[1]*256;
    var rg=ctx.createRadialGradient(sx,sy,2,sx,sy,42);
    rg.addColorStop(0,'rgba(255,250,230,0.95)');
    rg.addColorStop(0.35,'rgba(255,230,170,0.45)');
    rg.addColorStop(1,'rgba(255,220,150,0)');
    ctx.fillStyle=rg;ctx.fillRect(0,0,64,256);
  }
  var tex=new THREE.CanvasTexture(cv);
  tex.colorSpace=THREE.SRGBColorSpace;
  return tex;
}
/* 应用环境预设：切换背景/雾/地面/灯光；幂等可重复调用 */
function applyEnvPreset(key){
  var p=ENV_PRESETS[key];
  if(!p)return;
  curEnv=key;
  if(!scene)return;                       /* 3D 引擎未初始化（如直接打开页面未启用3D） */
  if(key==='none'){
    /* 无环境：恢复历史默认观感 */
    scene.background=null;
    scene.fog=null;
    if(grid3d)grid3d.visible=true;
    if(gnd3d){gnd3d.material=gndShadowMat;}          /* 恢复透明阴影地面 */
    if(lightKey&&LIGHT_INIT){
      lightKey.color.setHex(LIGHT_INIT.color);lightKey.intensity=LIGHT_INIT.intensity;
      lightKey.position.copy(LIGHT_INIT.pos);
      if(lightHemi){lightHemi.color.setHex(LIGHT_INIT.hemiSky);lightHemi.groundColor.setHex(LIGHT_INIT.hemiGnd);lightHemi.intensity=LIGHT_INIT.hemiInt;}
    }
  }else{
    /* 有环境：渐变天空背景 + 雾 + 实体地面 + 灯光色温调整 */
    if(!p._tex)p._tex=makeSkyTexture(p.stops,p.sun);   /* 天空纹理每预设只生成一次并缓存 */
    scene.background=p._tex;
    scene.fog=new THREE.Fog(p.fog.color,p.fog.near,p.fog.far);
    if(grid3d)grid3d.visible=false;                    /* 实体地面下隐藏网格 */
    if(gnd3d){
      if(!gnd3d.userData.envMat){                      /* 首次创建实体地面材质并缓存复用 */
        gnd3d.userData.envMat={};
      }
      var em=gnd3d.userData.envMat[key];
      if(!em){                                         /* 每个预设的地面材质只创建一次 */
        em=new THREE.MeshStandardMaterial({color:p.ground,roughness:p.groundRough,metalness:0.0});
        gnd3d.userData.envMat[key]=em;
      }
      gnd3d.material=em;                               /* ShadowMaterial 与实体材质来回切换 */
    }
    if(lightKey){
      lightKey.color.setHex(p.keyColor);lightKey.intensity=p.keyInt;
      lightKey.position.set(p.keyPos[0],p.keyPos[1],p.keyPos[2]);
    }
    if(lightHemi){lightHemi.color.setHex(p.hemiSky);lightHemi.intensity=p.hemiInt;}
  }
  try{localStorage.setItem('robot-env',key);}catch(e){}   /* 记住用户选择 */
}
/* 读取持久化的环境预设（页面启动时调用，非法值回退默认无环境） */
function restoreEnvPreset(){
  var k=null;
  try{k=localStorage.getItem('robot-env');}catch(e){}
  if(!k||!ENV_PRESETS[k])k='none';
  return k;
}
curEnv=restoreEnvPreset();           /* 启动时恢复上次选择的环境预设（无记录则默认无环境） */

/* 调试探针:记录加载过程每一步与失败原因,供诊断浮标/失败提示展示 */
window.__3D_LOAD_LOG__=[];
function probe(msg){try{window.__3D_LOAD_LOG__.push(String(msg).slice(0,220));}catch(e){}}
function errtxt(e){var m=(e&&e.message)?String(e.message):String(e);return m.slice(0,160);}
function loadDeps(cb){
  if(THREE){cb(true);return;}
  /* 状态机(见 HTML 顶部脚本的 importmap 注入):
     无标记 → 本地模式(相对路径,零依赖,所有 ES module 浏览器可用)
     标记 1/3/4 → CDN 模式(裸说明符,由注入的 importmap 解析,三源逐级切换)
     标记 9 → 回本地重试(CDN 全失败后的自愈),本地再失败则报错停止 */
  var mark=null;try{mark=sessionStorage.getItem('__three_cdn__');}catch(e){}
  var isFile=location.protocol==='file:';
  var cdnMode=isFile||mark==='1'||mark==='3'||mark==='4';
  var LOC='./lib/';
  var LOCS=['three.module.js','addons/controls/OrbitControls.js','addons/loaders/STLLoader.js','addons/environments/RoomEnvironment.js','addons/loaders/DRACOLoader.js'];
  var BARE=['three','three/addons/controls/OrbitControls.js','three/addons/loaders/STLLoader.js','three/addons/environments/RoomEnvironment.js','three/addons/loaders/DRACOLoader.js'];
  probe('开始加载 three 依赖 · 协议='+location.protocol+' · 模式='+(cdnMode?('CDN('+(mark||'file')+')'):'本地'));
  /* 失败推进状态机:返回 true=已切换并 reload,false=停止报错;每次切换都写时间戳(30分钟过期,防止永久卡CDN) */
  function stamp(){try{sessionStorage.setItem('__three_cdn_ts__',String(Date.now()));}catch(e){}}
  function advance(){
    var m=null;try{m=sessionStorage.getItem('__three_cdn__');}catch(e){}
    if(isFile){
      if(!m||m==='9'){try{sessionStorage.setItem('__three_cdn__','1');}catch(e){}}
      else if(m==='1'){try{sessionStorage.setItem('__three_cdn__','3');}catch(e){}}
      else if(m==='3'){try{sessionStorage.setItem('__three_cdn__','4');}catch(e){}}
      else return false;
      stamp();
      try{location.reload();}catch(e){}
      return true;
    }
    if(!m){try{sessionStorage.setItem('__three_cdn__','1');}catch(e){}}
    else if(m==='1'){try{sessionStorage.setItem('__three_cdn__','3');}catch(e){}}
    else if(m==='3'){try{sessionStorage.setItem('__three_cdn__','4');}catch(e){}}
    else if(m==='4'){try{sessionStorage.setItem('__three_cdn__','9');}catch(e){}}
    else return false;   /* '9':本地也失败,停止 */
    stamp();
    try{location.reload();}catch(e){}
    return true;
  }
  /* 超时包装:网络黑洞(连接挂起不失败)时强制推进状态机,避免 three=loading 卡死 */
  function withTimeout(p,ms,who){
    return Promise.race([p,new Promise(function(res,rej){
      setTimeout(function(){rej(new Error(who+' 加载超时('+(ms/1000)+'s)'));},ms);
    })]);
  }
  function imp(i){
    if(cdnMode)return withTimeout(import(BARE[i]),15000,BARE[i]).catch(function(e){probe('CDN '+BARE[i]+' 失败: '+errtxt(e));throw e;});
    return withTimeout(import(LOC+LOCS[i]),25000,LOCS[i]).catch(function(e){
      probe('本地 '+LOCS[i]+' 失败: '+errtxt(e));
      throw e;
    });
  }
  imp(0).then(function(M){THREE=M;window.__THREE_LOADED__=true;probe('three 核心 OK');window.__SHOW_DIAG__&&window.__SHOW_DIAG__();return imp(1);})
    .then(function(O){OrbitControls=O.OrbitControls;probe('OrbitControls OK');return imp(2);})
    .then(function(S){STLLoader=S.STLLoader;probe('STLLoader OK');return imp(3);})
    .then(function(R){RoomEnv=R.RoomEnvironment;probe('RoomEnvironment OK');return imp(4);})
    .then(function(D){DRACOLoader=D.DRACOLoader;probe('DRACOLoader OK');cb(true);})
    .catch(function(e){
      console.warn('[Robot3D] 引擎加载失败:',e);
      probe('❌ 加载失败: '+errtxt(e));
      window.__3D_FAILED__=true;
      if(advance())return;   /* 升级 CDN 源 / 回本地,重载后重试 */
      cb(false);
    });
}
/* ==================== 高保真PBR材质系统（航空级铝合金质感） ==================== */
/* 金属主体材质：高强度7075铝合金，磨砂阳极氧化质感 */
function mat(color){
  return new THREE.MeshStandardMaterial({
    color:color,
    metalness:0.88,        /* 高金属度：真实铝合金质感 */
    roughness:0.28,        /* 低粗糙度：细腻磨砂，带微弱反光 */
    envMapIntensity:1.3    /* 环境光反射强度：增强金属质感 */
  });
}
/* 深色结构件材质：碳纤维/黑色阳极氧化 */
function darkMat(color){
  return new THREE.MeshStandardMaterial({
    color:color||0x1e2530,
    metalness:0.75,
    roughness:0.45,
    envMapIntensity:1.0
  });
}
/* 关节电机外壳材质：亮面金属 */
function jointMat(color){
  return new THREE.MeshStandardMaterial({
    color:color||0x9aa4b2,
    metalness:0.92,
    roughness:0.22,
    envMapIntensity:1.5
  });
}
/* 橡胶材质：手部/脚垫防滑橡胶 */
function rubberMat(color){
  return new THREE.MeshStandardMaterial({
    color:color||0x1a1a1a,
    metalness:0.0,
    roughness:0.85
  });
}
/* 关节引用存储：jointName -> {group: THREE.Group, axis: 'x'|'y'|'z', min: 弧度, max: 弧度, zero: 四元数} */
let urdfJoints={};
let urdfRoot=null;
let animDemo=false;
let animTime=0;

/* 加载进度提示条（舞台顶部 ldtip 元素） */
function showLdtip(msg){var el=document.getElementById('ldtip');if(el){el.textContent=msg;el.classList.add('show');}}
function hideLdtip(){var el=document.getElementById('ldtip');if(el)el.classList.remove('show');}

/* 舞台中央加载指示（加载官方模型时显示，避免中间空屏）
   showLoading(text, prog)：prog 为 0~1 的进度（可省略，只更新文字）
   hideLoading()：隐藏中央加载指示 */
var _bootOvHidden=false;  /* 启动遮罩是否已撤下（首次出现真实进度/完成时撤下，覆盖引擎下载期无反馈缺口） */
function hideBootOvOnce(){
  if(_bootOvHidden)return;
  _bootOvHidden=true;
  var o=document.getElementById('bootOv');
  if(o)o.style.display='none';   /* 撤下启动遮罩（此后的反馈由中央进度条/3D画面接管） */
}
function showLoading(text,prog){
  hideBootOvOnce();              /* 真实进度出现：撤下启动遮罩 */
  var box=document.getElementById('loadBox');if(box)box.classList.add('show');
  var t=document.getElementById('loadText');if(t&&text!=null)t.textContent=text;
  var bar=document.getElementById('loadBarFill');if(bar&&prog!=null)bar.style.width=Math.round(prog*100)+'%';
}
function hideLoading(){hideBootOvOnce();var box=document.getElementById('loadBox');if(box)box.classList.remove('show');}

/* 统计对象树中的Mesh数量（用于性能面板显示） */
function countMeshes(root){
  if(!root)return 0;
  var cnt=0;
  root.traverse(function(o){if(o.isMesh)cnt++;});
  return cnt;
}

/* 把一个网格注册到部件分组（用于高亮/点击选中/聚焦） */
function regMesh(msh,partKey){
  msh.userData.partKey=partKey;
  if(!partGroups[partKey])partGroups[partKey]=[];
  partGroups[partKey].push(msh);
  /* 自动为每个实体网格创建线框轮廓，用于"其他部件半透明线框"效果 */
  if(!msh.userData.isWireframe && !msh.userData.wireframe){
    try{
      var wg=new THREE.EdgesGeometry(msh.geometry,25);  /* 25度阈值：只显示硬边，不显示三角面内部线 */
      var wm=new THREE.LineBasicMaterial({color:0x7a9cc6,transparent:true,opacity:0});
      var wire=new THREE.LineSegments(wg,wm);
      wire.userData.isWireframe=true;
      msh.userData.wireframe=wire;
      msh.add(wire);  /* 线框作为子对象，跟随实体网格移动 */
    }catch(e){/* 某些几何体可能不支持EdgesGeometry，忽略即可 */}
  }
}

/* ==================== 3D文字标签系统（Sprite+CanvasTexture） ==================== */
/* 创建零件名称标签：始终面向相机，深色半透明圆角背景+白色文字，带引线 */
function createPartLabel(text, position){
  if(!THREE)return null;
  /* 1. 用Canvas绘制标签纹理 */
  var pad=LABEL_PADDING;
  var fontSize=LABEL_FONT_SIZE;
  /* 先测量文字宽度 */
  var measure=document.createElement('canvas').getContext('2d');
  measure.font='bold '+fontSize+'px "Microsoft YaHei","PingFang SC",sans-serif';
  var textW=Math.ceil(measure.measureText(text).width);
  var canvas=document.createElement('canvas');
  canvas.width=textW+pad*2+4;
  canvas.height=fontSize+pad*2+4;
  var ctx=canvas.getContext('2d');
  /* 绘制圆角矩形背景 */
  var w=canvas.width,h=canvas.height;
  var r=4; /* 圆角半径 */
  ctx.beginPath();
  ctx.moveTo(r,0);ctx.lineTo(w-r,0);ctx.quadraticCurveTo(w,0,w,r);
  ctx.lineTo(w,h-r);ctx.quadraticCurveTo(w,h,w-r,h);
  ctx.lineTo(r,h);ctx.quadraticCurveTo(0,h,0,h-r);
  ctx.lineTo(0,r);ctx.quadraticCurveTo(0,0,r,0);
  ctx.closePath();
  ctx.fillStyle=LABEL_BG_COLOR;
  ctx.fill();
  /* 边框 */
  ctx.strokeStyle='rgba(122,156,198,0.6)';
  ctx.lineWidth=1;
  ctx.stroke();
  /* 绘制文字 */
  ctx.font='bold '+fontSize+'px "Microsoft YaHei","PingFang SC",sans-serif';
  ctx.fillStyle=LABEL_TEXT_COLOR;
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(text,w/2,h/2);
  /* 2. 创建Sprite材质 */
  var tex=new THREE.CanvasTexture(canvas);
  tex.minFilter=THREE.LinearFilter;
  tex.magFilter=THREE.LinearFilter;
  var spriteMat=new THREE.SpriteMaterial({map:tex,depthTest:false,depthWrite:false,transparent:true});
  var sprite=new THREE.Sprite(spriteMat);
  /* 3. 设置标签大小和位置 */
  var scaleFactor=0.12; /* 标签缩放因子：控制3D空间中的大小 */
  sprite.scale.set(w*scaleFactor,h*scaleFactor,1);
  if(position)sprite.position.copy(position);
  sprite.userData.isLabel=true;
  sprite.userData.labelText=text;
  sprite.renderOrder=999; /* 标签始终在最上层 */
  return sprite;
}

/* ==================== 视角/模式控制函数 ==================== */
/* 重置视角：回到初始相机位置 */
function resetView(){
  if(!camera||!controls)return;
  if(tdActive){
    /* 拆解场景重置：重置爆炸度、旋转 */
    tdExplodeT=0;tdExplodeDir=1;tdSpinOn=false;
    var exauto=document.getElementById('exauto');if(exauto)exauto.classList.remove('on');
    var exspin=document.getElementById('exspin');if(exspin)exspin.classList.remove('on');
    var exrng=document.getElementById('exrng');if(exrng){exrng.value=0;}
    applyTdExplode(0);
    if(tdGroup)tdGroup.rotation.set(0,0,0);
    /* 适配拆解场景 */
    setTimeout(function(){fitCameraToObject(tdGroup);},50);
  }else{
    /* 整机视角重置 */
    if(cameraInitTarget&&cameraInitPosition){
      controls.target.copy(cameraInitTarget);
      camera.position.copy(cameraInitPosition);
      controls.minDistance=cameraInitMinDist;
      controls.maxDistance=cameraInitMaxDist;
    }else{
      /* 默认视角 */
      controls.target.set(0,-15,0);
      camera.position.set(0,-15,CAMERA_DEFAULT_DIST);
      controls.minDistance=45;
      controls.maxDistance=220;
    }
    if(body3d)body3d.rotation.set(0,-0.25,0);
    controls.update();
  }
  /* 关闭自动旋转 */
  autoRotate=false;
  if(controls){controls.autoRotate=false;}
  /* 同步更新所有自动旋转按钮状态 */
  ['bbAutoRot','btnAutoRot2'].forEach(function(id){
    var btn=document.getElementById(id);
    if(btn)btn.classList.remove('on');
  });
}

/* 设置全局线框模式 */
function setWireframe(on){
  globalWireframe=!!on;
  /* 遍历所有注册的网格，切换线框/实体 */
  Object.keys(partGroups).forEach(function(pk){
    (partGroups[pk]||[]).forEach(function(msh){
      if(msh.material){
        if(Array.isArray(msh.material)){
          msh.material.forEach(function(mat){mat.wireframe=globalWireframe;});
        }else{
          msh.material.wireframe=globalWireframe;
        }
      }
    });
  });
  /* 拆解场景中的零件也要切换 */
  if(tdActive&&tdGroup){
    tdGroup.traverse(function(obj){
      if(obj.isMesh&&obj.material&&!obj.userData.isLabel){
        if(Array.isArray(obj.material)){
          obj.material.forEach(function(mat){mat.wireframe=globalWireframe;});
        }else{
          obj.material.wireframe=globalWireframe;
        }
      }
    });
  }
}

/* 设置自动旋转 */
function setAutoRotate(on){
  autoRotate=!!on;
  /* 使用OrbitControls自带的autoRotate */
  if(controls){
    controls.autoRotate=autoRotate;
    controls.autoRotateSpeed=2.0;
  }
}

/* 相机缩放（移动端按钮/键盘用）：沿视线方向移动相机 */
function zoomCamera3D(factor){
  if(!camera||!controls)return;
  var dir=new THREE.Vector3();
  camera.getWorldDirection(dir);
  var dist=controls.getDistance();
  var newDist=dist*factor;
  newDist=Math.max(controls.minDistance,Math.min(controls.maxDistance,newDist));
  var delta=newDist-dist;
  camera.position.addScaledVector(dir,delta);
  controls.update();
}

/* 键盘旋转控制：旋转整机模型（非拆解模式） */
function orbit3D(dx,dy){
  if(!body3d||tdActive)return;
  body3d.rotation.y+=dx*0.01;
  body3d.rotation.x+=dy*0.01;
  body3d.rotation.x=Math.max(-0.8,Math.min(0.8,body3d.rotation.x));
}

function initThree(){
  var canvas=document.getElementById('webgl');
  var isMobile=window.innerWidth<768||('ontouchstart' in window);
  try{
    renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:!isMobile,alpha:true});
  }catch(e){
    /* 【手机白屏修复】WebGL 创建失败（部分手机/浏览器无硬件加速）：显式提示原因与解决办法，
       并重新显示启动遮罩承载提示文案，而非留一张空白画布 */
    var _o=document.getElementById('bootOv'),_t=document.getElementById('bootTxt');
    if(_o){_o.style.display='flex';var _s=_o.querySelector('.spin');if(_s)_s.style.display='none';}
    if(_t)_t.innerHTML='当前设备/浏览器不支持 WebGL，无法显示 3D 模型。<br>请尝试：<b>系统浏览器</b>、最新版 Chrome/Safari，或在电脑上打开。';
    throw e;   /* 继续上抛终止后续初始化，避免渲染器空引用连环报错 */
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,isMobile?1.5:2));
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  if(isMobile)renderer.shadowMap.enabled=false;  /* 移动端关闭阴影渲染（桌面保持原样） */
  renderer.toneMapping=THREE.ACESFilmicToneMapping;  /* 电影级色调映射：真实金属反光 */
  renderer.toneMappingExposure=1.15;                 /* 曝光度：稍微提亮 */
  renderer.outputColorSpace=THREE.SRGBColorSpace;    /* sRGB色彩空间：颜色准确 */
  scene=new THREE.Scene();
  scene.background=null;
  camera=new THREE.PerspectiveCamera(45,1,0.1,1000);
  camera.position.set(0,-15,105);
  controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true; controls.dampingFactor=0.08;
  controls.minDistance=45; controls.maxDistance=220;
  controls.target.set(0,-15,0);
  controls.enablePan=false;
  if(isMobile)controls.zoomSpeed=1.2;  /* 移动端放大双指缩放速度（桌面保持默认 1.0） */
  /* 监听用户开始拖动：①标记已交互，避免加载完成后相机被强行复位；②取消进行中的聚焦动画，避免视角被拉回 */
  controls.addEventListener('start',function(){
    userInteracted=true;
    if(tween){cancelAnimationFrame(tween);tween=null;}
  });
  /* ==================== 环境贴图（修复金属材质发黑的关键） ====================
     高金属度 PBR 材质的反射几乎全靠环境贴图(IBL)，仅靠方向光时整机会发黑发暗；
     RoomEnvironment 程序化生成室内环境（无外部 HDR 下载），赋给 scene.environment 后
     所有金属/银白材质立即获得真实反射光泽 */
  const TONE_EXPOSURE=1.05;         /* 色调映射曝光：数值越大画面越亮（可调；环境亮度另由各材质 envMapIntensity 控制，r160 无 scene.environmentIntensity） */
  try{
    if(RoomEnv){
      var pmrem=new THREE.PMREMGenerator(renderer);
      scene.environment=pmrem.fromScene(new RoomEnv(),0.04).texture;
      pmrem.dispose();
    }
  }catch(e){console.warn('[Robot3D] 环境贴图生成失败（金属可能偏暗）:',e);}
  renderer.toneMapping=THREE.ACESFilmicToneMapping;  /* 电影级色调映射：高光不过曝、暗部有细节 */
  renderer.toneMappingExposure=TONE_EXPOSURE;
  /* ==================== 五光源布光系统（摄影棚级） ====================
     光源引用保存到模块级变量（lightHemi/lightKey/lightFill），供环境预设切换时调色 */
  /* 环境光：整体基础照明，避免死黑 */
  var hemi=new THREE.HemisphereLight(0xddeeff,0x2a2f3f,0.85); scene.add(hemi); lightHemi=hemi;
  /* 主光（Key Light）：右前上方，投射阴影 */
  var key=new THREE.DirectionalLight(0xffffff,1.25); key.position.set(22,35,28); key.castShadow=true;
  key.shadow.camera.left=-70;key.shadow.camera.right=70;key.shadow.camera.top=70;key.shadow.camera.bottom=-70;
  key.shadow.camera.near=1;key.shadow.camera.far=300;key.shadow.mapSize.set(2048,2048);
  key.shadow.bias=-0.0005;
  scene.add(key); lightKey=key;
  /* 保存主光初始参数，"无环境"预设恢复用 */
  LIGHT_INIT={color:key.color.getHex(),intensity:key.intensity,pos:key.position.clone(),
              hemiSky:hemi.color.getHex(),hemiGnd:hemi.groundColor.getHex(),hemiInt:hemi.intensity};
  /* 补光（Fill Light）：左前下方，冷蓝色调，消除硬阴影 */
  var fill=new THREE.DirectionalLight(0x88aaff,0.45); fill.position.set(-25,5,-18); scene.add(fill); lightFill=fill;
  /* 轮廓光（Rim Light）：后方，勾勒金属边缘高光 */
  var rim=new THREE.DirectionalLight(0x4488ff,0.6); rim.position.set(0,15,-35); scene.add(rim);
  /* 顶光：垂直向下，照亮肩部和头部顶面 */
  var top=new THREE.DirectionalLight(0xffffff,0.35); top.position.set(0,50,0); scene.add(top);
  /* 地面网格和阴影接收 */
  var grid=new THREE.GridHelper(90,45,0x2b8eff,0x1e2a3f); grid.material.opacity=0.18; grid.material.transparent=true; grid.position.y=-54; scene.add(grid); grid3d=grid;
  var gmat=new THREE.ShadowMaterial({opacity:0.32}); var gnd=new THREE.Mesh(new THREE.PlaneGeometry(150,150),gmat); gnd.rotation.x=-Math.PI/2; gnd.position.y=-54.1; gnd.receiveShadow=true; scene.add(gnd); gnd3d=gnd;
  gndShadowMat=gmat;   /* 保存透明阴影材质，"无环境"预设恢复用 */
  body3d=new THREE.Group(); scene.add(body3d);
  applyEnvPreset(curEnv);   /* 启动时应用上次选择的环境预设（默认无环境=原始观感） */
  buildRobot(currentModel);
  ray=new THREE.Raycaster(); ptr=new THREE.Vector2();
  canvas.addEventListener('pointerdown',onDown);
  canvas.addEventListener('click',onClick);
  window.addEventListener('resize',onResize);
  onResize();
  built=true;
}

/* ================= 机器人构建：优先官方 URDF+STL 真实模型，失败自动回退参数化模型 ================= */
/* 机型 URDF 资源配置 URDF_CFG 已移至 js/config.js（E4 拆分） */
var urdfToken=0; /* 加载序号令牌：防止切换机型后旧的异步结果覆盖新模型 */

function buildRobot(m){
  /* 官方模型已完整缓存：直接复用缓存的完整组装结果(秒切，不重建不下载) */
  if(urdfCache[m]&&urdfCache[m].wrap&&urdfCache[m].complete){
    while(body3d.children.length) body3d.remove(body3d.children[0]);
    body3d.add(urdfCache[m].wrap);
    urdfJoints=urdfCache[m].joints;
    partGroups=urdfCache[m].partGroups;
    urdfRoot=urdfCache[m].root;
    body3d.scale.set(1,1,1);
    body3d.position.copy(urdfCache[m].pos);
    body3d.rotation.y=urdfCache[m].rotY;
    if(!tdActive)fitCameraToObject(body3d,userInteracted);
    if(window.RobotApp)highlight(window.RobotApp.getCur());
    /* 刷新导航"无3D部件"标注（切换机型后 partGroups 已替换为新机型的） */
    if(window.RobotApp&&window.RobotApp.updateNav3d)window.RobotApp.updateNav3d();
    applyColorScheme(curScheme);   /* 缓存机型重新入场景后，重应用当前配色方案 */
    return;
  }
  while(body3d.children.length) body3d.remove(body3d.children[0]);
  partGroups={};
  body3d.scale.set(1,1,1);      /* 复位变换，避免上一机型残留 */
  body3d.position.set(0,0,0);
  body3d.rotation.y=-0.25;      /* 复位初始朝向，避免上一机型残留 */
  /* 【性能优化】先立即构建参数化机器人"秒出"显示，再后台加载官方 STL 无缝替换。
     否则打开页面会空白等待大体积 STL（H1约16MB/G1约18MB）下载完，感知上"加载很慢" */
  buildFallbackRobot(m);
  applyColorScheme(curScheme);   /* 参数化回退模型也应用当前配色方案 */
  fitCameraToObject(body3d);
  window.__RENDERED__=true;      /* 诊断浮标:首屏参数化模型已渲染 */
  loadUrdfRobot(m);
}

/* URDF link 名称 → 教学部件键 的映射（供点击选中与高亮使用） */
/* 按关节类型和位置精确分类，H1和G1分别处理 */
function linkToPart(ln){
  /* 传感器类（IMU、深度相机、激光雷达）归到躯干/头部 */
  if(/imu|d435|mid360|camera|lidar|sensor/.test(ln))return 'sensor';
  /* 主体结构 */
  if(/torso|logo/.test(ln))return 'torso';
  if(/head/.test(ln))return 'head';
  if(/neck/.test(ln))return 'neck';
  /* X1 腰部 link 名为 lumber_yaw/roll/pitch，与宇树的 waist 命名统一归入腰部 */
  if(/waist|lumber|pelvis_contour|pelvis(?!_)/.test(ln))return 'waist';
  /* 手臂关节 */
  if(/shoulder/.test(ln))return 'shoulder';
  if(/elbow/.test(ln))return 'elbow';
  if(/wrist/.test(ln))return 'wrist';
  if(/rubber_hand|hand/.test(ln))return 'hand';
  /* 灵巧手手指关节：H1带手版的 _thumb_/_index_/_middle_/_ring_/_pinky_ 手指 link 也归入手部 */
  if(/_thumb_|_index_|_middle_|_ring_|_pinky_/.test(ln))return 'hand';
  /* 腿部关节 */
  if(/hip/.test(ln))return 'hip';
  if(/knee/.test(ln))return 'knee';
  if(/ankle/.test(ln))return 'ankle';
  /* X1 足部 link 名为 leg_l_toe_xxx / leg_r_toe_xxx，归入足部 */
  if(/toe|foot/.test(ln))return 'foot';
  /* pelvis基础链接 */
  if(/pelvis/.test(ln))return 'waist';
  return 'torso';
}

/* ==================== 部件配色系统（工业机器人美学配色） ==================== */
/* 同类型关节/结构使用统一颜色，左右对称颜色一致（PART_COLORS 已移至 js/config.js，E4 拆分） */

/* 为每个mesh创建独立材质（克隆），避免透明度互相干扰 */
function createPartMaterial(partKey){
  var c = PART_COLORS[partKey] || PART_COLORS.torso;
  return new THREE.MeshStandardMaterial({
    color: c.hex,
    metalness: c.metal,
    roughness: c.rough,
    envMapIntensity: 1.2,
    side: THREE.DoubleSide
  });
}

/* ==================== 配色方案应用（遍历整机所有 mesh 切换材质外观） ====================
   首次遇到每个 mesh 时把初始材质参数备份到 userData.origMat（"原配色"方案恢复用）；
   线框副本(isWireframe)/标签(isLabel)不参与换色；拆解场景 tdGroup 不在 body3d 下不受影响 */
function applyColorScheme(key){
  var s=COLOR_SCHEMES[key];
  if(!s||!body3d)return;
  curScheme=key;
  body3d.traverse(function(o){
    var m=o.material;
    if(!m||o.userData.isWireframe||o.userData.isLabel)return;  /* 跳过线框副本与零件标签 */
    /* 首次备份初始材质（dark 方案恢复的数据源） */
    if(!o.userData.origMat){
      o.userData.origMat={
        color:m.color.getHex(), metalness:m.metalness, roughness:m.roughness,
        emissive:m.emissive?m.emissive.getHex():0,
        emissiveIntensity:(m.emissiveIntensity==null)?1:m.emissiveIntensity
      };
    }
    var om=o.userData.origMat;
    if(key==='dark'){
      /* 原配色方案：恢复构建时的分部件初始材质 */
      m.color.setHex(om.color);
      m.metalness=om.metalness;
      m.roughness=om.roughness;
      if(m.emissive){m.emissive.setHex(om.emissive);m.emissiveIntensity=om.emissiveIntensity;}
    }else{
      /* 其他方案：统一覆盖颜色/金属度/粗糙度 */
      m.color.setHex(s.color);
      m.metalness=s.metal;
      m.roughness=s.rough;
      if(m.emissive&&s!==COLOR_SCHEMES.silver){m.emissive.setHex(0);m.emissiveIntensity=0;}
    }
    /* 透明度参数（ghost 半透明 / 其他不透明），transparent 切换需 needsUpdate 才生效 */
    m.transparent=s.opacity<1.0;
    m.opacity=s.opacity;
    m.depthWrite=s.depthWrite;
    m.needsUpdate=true;
  });
  try{localStorage.setItem('robot-color-v2',key);}catch(e){}   /* 记住用户选择（v2 键，与旧 robot-color 断开） */
}
/* 读取持久化的配色方案（页面启动时调用，非法值回退默认原配色） */
function restoreColorScheme(){
  var k=null;
  try{k=localStorage.getItem('robot-color-v2');}catch(e){}
  if(!k||!COLOR_SCHEMES[k])k='dark';
  return k;
}

/* 解析 URDF 文本：提取各 link 的视觉网格文件名与各 joint 的父子关系和位姿 */
function parseUrdf(xmlText){
  var doc=new DOMParser().parseFromString(xmlText,'application/xml');
  var links={};
  Array.prototype.forEach.call(doc.getElementsByTagName('link'),function(l){
    var name=l.getAttribute('name')||'';
    var vis=l.getElementsByTagName('visual')[0];           /* 只取 visual 网格，忽略 collision */
    var meshEl=vis?vis.getElementsByTagName('mesh')[0]:null;
    var fn=meshEl?meshEl.getAttribute('filename'):null;
    /* 官方 URDF 常同时提供 .dae 和 .STL 双格式；本系统用 STLLoader 统一加载 .STL，
       把 .dae 引用替换成 .STL，避免加载 .dae 导致 404 */
    if(fn)fn=fn.replace(/\.dae$/i,'.STL');
    links[name]={mesh:fn};
  });
  var joints=[];
  Array.prototype.forEach.call(doc.getElementsByTagName('joint'),function(j){
    var pe=j.getElementsByTagName('parent')[0],ce=j.getElementsByTagName('child')[0],oe=j.getElementsByTagName('origin')[0];
    var ae=j.getElementsByTagName('axis')[0],le=j.getElementsByTagName('limit')[0];
    var ax=[0,0,0],lim=null;
    if(ae){var av=ae.getAttribute('xyz');if(av)ax=av.trim().split(/\s+/).map(Number);}
    if(le){
      lim={
        lower:parseFloat(le.getAttribute('lower')||'-1.5708'),
        upper:parseFloat(le.getAttribute('upper')||'1.5708'),
        effort:parseFloat(le.getAttribute('effort')||'0'),
        velocity:parseFloat(le.getAttribute('velocity')||'0')
      };
    }
    joints.push({
      type:j.getAttribute('type')||'fixed',
      parent:pe?pe.getAttribute('link'):'',
      child:ce?ce.getAttribute('link'):'',
      xyz:(oe&&oe.getAttribute('xyz'))?oe.getAttribute('xyz').trim().split(/\s+/).map(Number):[0,0,0],
      rpy:(oe&&oe.getAttribute('rpy'))?oe.getAttribute('rpy').trim().split(/\s+/).map(Number):[0,0,0],
      axis:ax,
      limit:lim
    });
  });
  return {links:links,joints:joints};
}

/* 按 URDF 运动学树递归装配三维模型（所有关节取零位，即标准站立姿态） */
/* 同时保存关节引用，区分金属/橡胶/深色材质，支持后续关节控制 */
function assembleUrdf(parsed,geos){
  urdfJoints={};
  var childMap={},isChild={};
  var jointByChild={}; /* child link 名 -> joint 定义 */
  parsed.joints.forEach(function(j){
    (childMap[j.parent]=childMap[j.parent]||[]).push(j);
    isChild[j.child]=true;
    jointByChild[j.child]=j;
  });
  var root=null;
  for(var ln in parsed.links){if(!isChild[ln]){root=ln;break;}}
  if(!root)root='pelvis';

  /* 根据link名称智能选择材质（使用部件配色系统，每个mesh独立材质） */
  function pickMaterial(linkName,meshName){
    var partKey = linkToPart(linkName);
    /* Logo特殊处理：深色 */
    if(/logo/.test(linkName))return darkMat(0x1e2530);
    /* 传感器使用科技蓝材质 */
    if(partKey==='sensor'){
      return new THREE.MeshStandardMaterial({
        color:0x3a7bd5, metalness:0.6, roughness:0.35,
        emissive:0x1a4080, emissiveIntensity:0.15
      });
    }
    return createPartMaterial(partKey);
  }

  function build(linkName){
    var g=new THREE.Group(); g.name=linkName;
    var info=parsed.links[linkName];
    if(info&&info.mesh){
      var base=info.mesh.split('/').pop();
      var geo=geos[base];
      if(geo){
        var partKey = linkToPart(linkName);
        var msh=new THREE.Mesh(geo,pickMaterial(linkName,base));
        msh.castShadow=true;msh.receiveShadow=true;
        msh.userData.linkName=linkName;
        msh.userData.partKey=partKey;
        msh.userData.originalColor = PART_COLORS[partKey]?PART_COLORS[partKey].hex:0xc8cfd9;
        regMesh(msh,partKey);
        g.add(msh);
        /* 为每个实体mesh添加一个线框轮廓副本（用于选中时其他部件显示线框） */
        var edges = new THREE.EdgesGeometry(geo, 30);
        var wireMat = new THREE.LineBasicMaterial({
          color: 0x8aa8c8, transparent:true, opacity:0.0,
          depthTest:false
        });
        var wire = new THREE.LineSegments(edges, wireMat);
        wire.userData.isWireframe = true;
        wire.userData.partKey = partKey;
        wire.renderOrder = 999;
        msh.userData.wireframe = wire;
        g.add(wire);
      }
    }
    (childMap[linkName]||[]).forEach(function(j){
      var jg=new THREE.Group();
      jg.name='joint_'+j.child;
      jg.position.set(j.xyz[0]||0,j.xyz[1]||0,j.xyz[2]||0);
      /* URDF rpy = Rz(yaw)·Ry(pitch)·Rx(roll)，四元数按同序相乘 */
      var q=new THREE.Quaternion()
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),j.rpy[2]||0))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),j.rpy[1]||0))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),j.rpy[0]||0));
      jg.quaternion.copy(q);
      /* 保存关节零位四元数，用于复位和角度叠加 */
      var zeroQ=q.clone();
      /* 解析关节轴和限位（URDF中axis单位向量，limit单位弧度） */
      var axisEl=j.axis||null; var limitEl=j.limit||null;
      var ax='y'; var limLo=-Math.PI/2, limHi=Math.PI/2;
      if(j.axis){
        var av=j.axis;
        if(Math.abs(av[0])>0.5)ax='x';
        else if(Math.abs(av[1])>0.5)ax='y';
        else ax='z';
      }
      if(j.limit){
        limLo=j.limit.lower||limLo;
        limHi=j.limit.upper||limHi;
      }
      /* 只保留有运动意义的关节（revolute/continuous），过滤fixed关节 */
      if(j.type&&j.type!=='fixed'&&j.type!=='floating'){
        urdfJoints[j.child]={
          group:jg,
          axis:ax,
          min:limLo,
          max:limHi,
          zero:zeroQ,
          name:j.child,
          parent:j.parent
        };
      }
      jg.add(build(j.child));
      g.add(jg);
    });
    return g;
  }
  var robotRoot=build(root);
  urdfRoot=robotRoot;
  return robotRoot;
}

/* ===== 压缩 STL 智能加载（网络提速核心） =====
   三级优先级自动降级，任何一级失败不影响页面可用：
   1) .drc  —— Draco 压缩（全库 21.8MB(.gz) 再压到 4.6MB，传输量最省，首选）
   2) .gz   —— gzip 压缩 + 浏览器内置 DecompressionStream 流式解压（Chrome80+/Edge80+/Safari16.4+）
   3) .STL  —— 原始未压缩（最终兜底，老浏览器/文件缺失时页面仍可用）
   返回 Promise<BufferGeometry>，失败时 reject 由调用方处理。 */
/* DRC/GZ 压缩加载开关已移至 js/config.js（E4 拆分） */
var _stlParseLoader=null; /* 共享的 STLLoader 实例（只用其 parse 方法解析解压后的字节） */
function stlGeoSmart(url){
  /* 【精细模式】用户选择"精细模型"时跳过 .drc/.gz 压缩,直接加载原始 STL(全精度,数据量大) */
  var FINE=!1;try{FINE=localStorage.getItem('robot-fine-mode')==='1';}catch(e){}
  if(FINE)return stlGeoFallback(url);
  /* 第一优先级：.drc（Draco 加载器已就绪且开关打开才尝试；失败自动降级 .gz） */
  if(DRC_STL_ENABLE&&DRACOLoader&&window.fetch)return stlGeoDrc(url).catch(function(){return stlGeoGz(url);});
  return stlGeoGz(url);                              /* 未就绪/关闭开关：直接走 .gz 逻辑 */
}
/* Draco .drc 加载：xxx.STL → 同名 xxx.drc；解码器 wasm(lib/draco/)只加载一次全程复用
   （解码超时参数 DRC_DECODE_TIMEOUT_MS 已移至 js/config.js，E4 拆分） */
function stlGeoDrc(url){
  if(!_dracoLoader){
    _dracoLoader=new DRACOLoader();
    _dracoLoader.setDecoderPath('lib/draco/');       /* 解码器文件随项目部署，离线可用且 PWA 可缓存 */
  }
  return fetch(url.replace(/\.STL$/i,'.drc')).then(function(r){
    if(!r.ok)throw new Error('drc '+r.status);       /* .drc 不存在(404)等：转入回退 */
    return r.arrayBuffer();
  }).then(function(buf){
    /* decodeDracoFile 返回 Promise，回调里过一遍法线保底（与 STL 路径同一套防线）。
       外包一层超时保险：解码器卡死（wasm加载失败/worker无响应）时 reject 转入 .gz 回退，
       避免单个零件永久挂起拖死整体进度（兼容回调式与Promise式两种 three 版本） */
    return new Promise(function(resolve,reject){
      var settled=false;
      var timer=setTimeout(function(){
        if(settled)return;
        settled=true;
        reject(new Error('drc decode timeout'));     /* 超时：放弃解码，走回退链 */
      },DRC_DECODE_TIMEOUT_MS);
      function ok(g){if(settled)return;settled=true;clearTimeout(timer);resolve(ensureNormals(g));}
      function bad(e){if(settled)return;settled=true;clearTimeout(timer);reject(e);}
      try{
        var p=_dracoLoader.decodeDracoFile(buf,ok);  /* 回调式成功 */
        if(p&&p.then)p.then(function(g){ok(g);}).catch(bad);  /* Promise式成功/失败 */
      }catch(e){bad(e);}
    });
  });
}
/* .gz 加载：优先 fetch .gz + 浏览器内置 DecompressionStream 流式解压，失败回退原始 STL */
function stlGeoGz(url){
  /* 浏览器不支持 fetch/DecompressionStream：直接走原始 STL 的 XHR 加载 */
  if(!GZ_STL_ENABLE||!window.fetch||!window.DecompressionStream)return stlGeoFallback(url);
  return fetch(url+'.gz').then(function(r){
    if(!r.ok)throw new Error('gz '+r.status);        /* .gz 不存在(404)等：转入回退 */
    /* 流式解压：用 Response 包住解压流再取 ArrayBuffer，避免整个压缩块重复占内存 */
    return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }).then(function(buf){
    if(!_stlParseLoader)_stlParseLoader=new STLLoader();
    return ensureNormals(_stlParseLoader.parse(buf));  /* 解压出的 STL 字节 → 几何体（并保证法线有效） */
  }).catch(function(){
    return stlGeoFallback(url);                      /* 任何环节失败：回退原始未压缩 STL */
  });
}
/* 模型预取辅助（供减速器/机型预载复用）：按与正式加载 stlGeoSmart 完全相同的
   优先级顺序 .drc → .gz → 原始STL 把文件拉进浏览器 HTTP 缓存，保证预取命中 */
function prefetchModel(u){
  return fetch(u.replace(/\.STL$/i,'.drc'))
    .catch(function(){throw 0;})                     /* 网络层失败也统一抛出，进入下一级 */
    .then(function(r){if(r.ok)return r;throw 0;})    /* .drc 不存在：降级 .gz */
    .catch(function(){return fetch(u+'.gz');})
    .then(function(r){if(r.ok)return r;throw 0;})    /* .gz 不存在：降级原始 STL */
    .catch(function(){return fetch(u);});
}
/* 回退路径：直接加载原始未压缩 STL（STLLoader 内部走 XHR，老浏览器兼容） */
function stlGeoFallback(url){
  return new Promise(function(res,rej){
    if(!STLLoader){rej(new Error('STLLoader 未就绪'));return;}
    new STLLoader().load(url,function(g){res(ensureNormals(g));},undefined,function(e){rej(e);});
  });
}
/* 法线保底：STL 文件自带的法线字段若全为零（如工具生成/减面时未算法线），
   光照计算会得到全黑零件——检测到全零时按三角形顶点自动重算法线 */
function ensureNormals(geo){
  try{
    var n=geo&&geo.attributes&&geo.attributes.normal;
    if(!n||!n.array||!n.array.length)return geo;
    var a=n.array,i;
    for(i=0;i<a.length;i++){ if(Math.abs(a[i])>1e-6)break; }   /* 扫到第一个非零分量即认为法线有效 */
    if(i>=a.length)geo.computeVertexNormals();                 /* 全零：按顶点重新计算法线 */
  }catch(e){/* 法线检测失败不影响加载 */}
  return geo;
}

/* 限并发 + 重试 + 失败容忍的STL加载器：个别文件加载失败时跳过该零件，不中断整体加载 */
/* 可调参数（重试次数/并发数/重试间隔）已移至 js/config.js，E4 拆分 */
function loadSTLsTolerant(dir,names,loader,onProgress,onEach){
  /* onEach(stlName,geo)：每个STL下载成功时立即回调一次，供"逐零件增量组装"就地替换零件，
     让机器人边下边长出来，而不是等全部STL下完才一次性出现 */
  var success=[],idx=0,doneCnt=0; /* doneCnt：已完成（成功或失败）的STL数量，用于进度显示 */
  /* 加载单个STL（优先 .gz 压缩版）：失败时按剩余次数重试，重试耗尽则容忍跳过（返回null，不中断整体） */
  function loadOne(n,retryLeft){
    return stlGeoSmart(dir+'/'+n).then(function(g){return {n:n,g:g};})
    .catch(function(e){
      if(retryLeft>0){
        return new Promise(function(r){setTimeout(r,STL_RETRY_DELAY*(STL_MAX_RETRY-retryLeft+1));})
          .then(function(){return loadOne(n,retryLeft-1);});
      }
      console.warn('[Robot3D] 单个STL加载失败，已跳过该零件:',n,e);
      return null; /* 容忍失败：返回null，不中断其他零件的加载 */
    });
  }
  /* 工作线程：从共享队列逐个取文件名加载，实现限并发 */
  function worker(){
    return new Promise(function(resolve){
      (function step(){
        if(idx>=names.length){resolve();return;}
        var n=names[idx++];
        loadOne(n,STL_MAX_RETRY).then(function(res){
          if(res){
            success.push(res);
            if(onEach)onEach(res.n,res.g);   /* 立即注入该零件，不等全部下载完 */
          }
          doneCnt++; /* 每完成一个STL（含失败跳过）都累计一次进度 */
          if(onProgress)onProgress(doneCnt,names.length); /* 回调上报进度，供顶栏提示显示 */
          step();
        });
      })();
    });
  }
  var workers=[];
  for(var i=0;i<STL_CONCURRENCY&&i<names.length;i++)workers.push(worker());
  return Promise.all(workers).then(function(){return success;});
}

/* ===== 逐零件增量组装：占位 + 注入 + 骨架归一化 =====
   目标：机器人"边下边长出来"，而不是等全部STL下载完才一次性出现。
   流程：先用占位几何把整机骨架按正确缩放/站位搭出来 → 每个STL下载完成
   就地注入替换对应零件 → 全部到位后由 applyUrdf 用精确几何做最终归一化。 */

/* 占位几何：真实STL下载完成前，先用这个小方盒占位，让整机骨架立刻可见 */
function makePlaceholderGeo(){return new THREE.BoxGeometry(PLACEHOLDER_SIZE,PLACEHOLDER_SIZE,PLACEHOLDER_SIZE);}  /* 占位边长 PLACEHOLDER_SIZE 见 js/config.js */

/* 在装配树上按 link 名查找对应分组（增量注入时定位要替换的零件） */
function findLinkGroup(o,name){
  if(o.name===name)return o;
  if(o.children)for(var i=0;i<o.children.length;i++){
    var r=findLinkGroup(o.children[i],name);
    if(r)return r;
  }
  return null;
}

/* 把一个下载完成的STL几何注入到使用它的所有 link 分组，就地替换占位几何（并同步更新线框） */
function injectMeshGeometry(wrapRoot,linkNames,geo){
  if(!geo)return;
  for(var k=0;k<linkNames.length;k++){
    var g=findLinkGroup(wrapRoot,linkNames[k]);
    if(!g)continue;
    for(var i=0;i<g.children.length;i++){
      var c=g.children[i];
      if(c.isMesh&&c.userData.linkName===linkNames[k]){
        c.geometry=geo;   /* 就地替换几何，保留该零件的变换/材质/线框挂载 */
        if(c.userData.wireframe){
          try{c.userData.wireframe.geometry=new THREE.EdgesGeometry(geo,30);}
          catch(e){/* 某些几何体可能不支持EdgesGeometry，忽略即可 */}
        }
        return;
      }
    }
  }
}

/* 用URDF关节骨架（各link分组的世界坐标原点）估算整机包围盒，无需等待全部STL，
   用于在加载一开始就给出正确缩放/站位 */
function skeletonBBox(wrap){
  var b=new THREE.Box3(),v=new THREE.Vector3();
  (function walk(o){
    if(o.isGroup&&o.name&&o.name.indexOf('joint_')!==0){o.getWorldPosition(v);b.expandByPoint(v);}
    var ch=o.children;if(ch)for(var i=0;i<ch.length;i++)walk(ch[i]);
  })(wrap);
  return b;
}

/* 归一化基准 ROBOT_TARGET_H / FLOOR_Y 已移至 js/config.js（E4 拆分） */
/* 按骨架包围盒把整机缩放到 targetH 高、脚底落地、水平居中（缩放/站位公式与 applyUrdf 相同） */
function normalizeFromSkeleton(body3d,wrap){
  var b=skeletonBBox(wrap);
  var s=ROBOT_TARGET_H/Math.max(0.001,b.max.y-b.min.y);
  wrap.scale.set(s,s,s);
  var b2=skeletonBBox(wrap);
  body3d.position.set(-(b2.min.x+b2.max.x)/2,FLOOR_Y-b2.min.y,-(b2.min.z+b2.max.z)/2);
}

/* ===== 官方模型内存缓存 =====
   已加载过的机型缓存 {wrap, joints, partGroups, root, pos, rotY, complete}，
   complete 标记该机型是否已全部零件下载完成；未完成(complete:false 的占位骨架)
   不会走"秒切缓存"，保证切换/对比时不会误用半成品 */
var urdfCache={};

/* 用已解析的 URDF + 已加载的 geometry 组装机器人到场景(首次加载与缓存复用共用此函数) */
function applyUrdf(m,parsed,list,names){
  var geos={};
  list.forEach(function(it){geos[it.n]=it.g;});
  var missing=(names?names.length:0)-Object.keys(geos).length;
  /* 清空回退模型，换上真实模型 */
  while(body3d.children.length)body3d.remove(body3d.children[0]);
  partGroups={};
  body3d.scale.set(1,1,1); /* 复位缩放：清除回退模型遗留的机型比例 */
  var root=assembleUrdf(parsed,geos);
  /* URDF 为 Z 轴朝上、场景为 Y 轴朝上：绕X转-90°立起，再绕Y转-90°使正面朝向相机 */
  var wrap=new THREE.Group();
  var qx=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
  var qy=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/2);
  wrap.quaternion.copy(qy.multiply(qx));
  wrap.add(root);
  body3d.add(wrap);
  body3d.rotation.y=-0.25;
  /* 归一化：整机高度缩放到 85 场景单位、脚底落在地面 y=-54、水平居中 */
  var b=new THREE.Box3().setFromObject(body3d);
  var s=85/Math.max(0.001,b.max.y-b.min.y);
  wrap.scale.set(s,s,s);
  var b2=new THREE.Box3().setFromObject(body3d);
  body3d.position.set(-(b2.min.x+b2.max.x)/2,-54-b2.min.y,-(b2.min.z+b2.max.z)/2);
  /* 缓存完整组装结果：切换机型时直接复用 wrap 秒切，跳过重建(不重新 assemble/算线框) */
  urdfCache[m]={wrap:wrap,joints:urdfJoints,partGroups:partGroups,root:urdfRoot,pos:body3d.position.clone(),rotY:body3d.rotation.y};
  /* 更新自由度显示 */
  var dofEl=document.getElementById('dof');
  if(dofEl){dofEl.textContent=Object.keys(urdfJoints).length;}
  if(!tdActive)fitCameraToObject(body3d,userInteracted);
  hideLoading();
  preloadReducers(2500);
  preloadRobots(PRELOAD_ROBOTS_DELAY);   /* 后台预取三机同屏机型到 HTTP 缓存，点对比按钮时秒开 */
  showLdtip('官方模型加载完成'+(missing>0?('，'+missing+'个零件加载失败已跳过'):''));
  setTimeout(hideLdtip,1800);
  if(window.RobotApp)highlight(window.RobotApp.getCur());
  /* 刷新导航"无3D部件"标注（新机型的 partGroups 已就绪） */
  if(window.RobotApp&&window.RobotApp.updateNav3d)window.RobotApp.updateNav3d();
  applyColorScheme(curScheme);   /* 官方模型组装完成后，应用当前配色方案 */
}

/* 异步加载官方 URDF+STL：成功替换回退模型；加载失败则保留回退模型并给出提示
   done：可选完成回调（同屏对比功能用它串行加载两机型；成功与失败都会回调） */
function loadUrdfRobot(m,done){
  /* file:// 协议下浏览器CORS策略阻止加载本地STL/URDF文件，直接使用内置高保真模型 */
  if(window.__IS_FILE_PROTO__){
    showLdtip('离线模式：已加载内置模型（file:// 无法读取官方STL，请用"启动教学页面.bat"打开以显示官方模型）');
    setTimeout(hideLdtip,3000);
    hideLoading();         /* 隐藏中央加载指示（参数化模型已由 buildRobot 提前显示） */
    setTimeout(function(){fitCameraToObject(body3d);},100);
    if(done)done();
    return;
  }
  var cfg=URDF_CFG[m];
  if(!cfg||!window.fetch){
    showLdtip('使用内置高保真模型');
    setTimeout(hideLdtip,2000);
    hideLoading();         /* 隐藏中央加载指示（参数化模型已由 buildRobot 提前显示） */
    setTimeout(function(){fitCameraToObject(body3d);},100);
    if(done)done();
    return;
  }
  /* 内存缓存命中(且已完整加载)：直接复用已加载的整机组装结果，跳过重复下载解析(切换机型秒切)。
     未完整加载(complete:false 的占位骨架)不命中，走下方增量加载流程重新补齐 */
  if(urdfCache[m]&&urdfCache[m].wrap&&urdfCache[m].complete){
    var cc=urdfCache[m];
    while(body3d.children.length)body3d.remove(body3d.children[0]);
    body3d.add(cc.wrap);
    urdfJoints=cc.joints;
    partGroups=cc.partGroups;
    urdfRoot=cc.root;
    body3d.scale.set(1,1,1);
    body3d.position.copy(cc.pos);
    body3d.rotation.y=cc.rotY;
    if(!tdActive)fitCameraToObject(body3d,userInteracted);
    if(window.RobotApp)highlight(window.RobotApp.getCur());
    if(window.RobotApp&&window.RobotApp.updateNav3d)window.RobotApp.updateNav3d();
    if(done)done();
    return;
  }
  var token=++urdfToken;
  showLdtip('正在加载官方3D模型...');
  showLoading('正在加载官方3D模型…',0); /* 显示中央加载指示+进度条（初始0%） */
  /* parsed/names 必须提升到函数作用域：后续 .then 回调需要访问它们，
     若在回调内用 var 声明，另一个回调访问会报 not defined */
  var parsed=null;
  var names=[];
  var fileToLinks={};   /* 网格文件名 -> 使用它的 link 名列表（供逐零件注入定位） */
  var wrap=null;        /* 占位骨架：真实STL边下载边替换，实现"机器人边下边长出来" */
  fetch(cfg.urdf)
    .then(function(r){if(!r.ok)throw new Error('URDF HTTP '+r.status);return r.text();})
    .then(function(txt){
      parsed=parseUrdf(txt);
      /* 收集需要加载的网格文件清单（去重）+ 建立 文件名 -> link 名 映射 */
      var need={};
      Object.keys(parsed.links).forEach(function(k){
        var f=parsed.links[k].mesh;
        if(f){
          var base=f.split('/').pop();
          need[base]=1;
          (fileToLinks[base]=fileToLinks[base]||[]).push(k);
        }
      });
      names=Object.keys(need);
      /* 【可调】大体积零件清单：这些零件排到最后加载——小零件先到位快速成型，
         大零件（已减面，gz 后 0.4-1.1MB/个）在后台陆续补齐，不阻塞整机轮廓出现 */
      var BIG_STL_LAST=[
        'arm_r_wrist_a_ball.STL','arm_r_wrist_b_ball.STL',   /* X1 腕部滚动体（内部件，减面后仍最大） */
        'lumber_yaw.STL','left_ankle_roll.STL','right_hip_pitch.STL',
        'right_hip_roll.STL','left_hip_roll.STL','left_hip_pitch.STL',
        'left_shoulder_pitch.STL','right_shoulder_pitch.STL','right_ankle_roll.STL',
        'right_shoulder_yaw.STL','right_elbow_pitch.STL','left_elbow_pitch.STL',
        'lumber_pitch.STL','left_shoulder_roll.STL','base_link_simple.STL',
        'right_ankle_pitch.STL','left_ankle_pitch.STL','right_shoulder_roll.STL'
      ];
      names.sort(function(a,b){   /* 命中大文件清单的排到队列末尾 */
        var ka=BIG_STL_LAST.indexOf(a)>=0?1:0,kb=BIG_STL_LAST.indexOf(b)>=0?1:0;
        return ka-kb;
      });
      if(!names.length||!STLLoader)throw new Error('无STL网格或加载器未就绪');
      /* 逐零件增量组装：先用占位几何把整机骨架立刻搭出来（正确缩放/站位），
         之后每个STL下载完成就替换进对应零件——机器人不再是"等全部下完才一次性出现" */
      var placeholders={};
      names.forEach(function(n){placeholders[n]=makePlaceholderGeo();});
      var root=assembleUrdf(parsed,placeholders);
      /* 复刻 applyUrdf 的坐标变换：URDF Z轴->场景Y轴，再绕Y使正面朝向相机 */
      wrap=new THREE.Group();
      var qx=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
      var qy=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/2);
      wrap.quaternion.copy(qy.multiply(qx));
      wrap.add(root);
      /* 清空回退模型，换上真实模型（此刻为占位骨架，随后零件逐个被精模替换） */
      while(body3d.children.length)body3d.remove(body3d.children[0]);
      body3d.scale.set(1,1,1);
      body3d.rotation.y=-0.25;
      body3d.add(wrap);
      /* 用URDF骨架包围盒归一化尺度/站位（无需等全部STL，从第一步起就正确缩放） */
      normalizeFromSkeleton(body3d,wrap);
      /* 缓存占位骨架（complete:false），切换/对比不会误用半成品；
         加载完成后 applyUrdf 会用精确几何归一化覆盖该缓存 */
      urdfCache[m]={wrap:wrap,joints:urdfJoints,partGroups:partGroups,root:urdfRoot,pos:body3d.position.clone(),rotY:body3d.rotation.y,complete:false};
      var dofEl=document.getElementById('dof');
      if(dofEl){dofEl.textContent=Object.keys(urdfJoints).length;}
      var loader=new STLLoader();
      /* onProgress 刷新进度提示；onEach 每个STL下载完成立即注入对应零件 */
      return loadSTLsTolerant(cfg.dir, names, loader, function(done,total){
        showLdtip('正在加载官方3D模型 ('+done+'/'+total+')');
        showLoading('正在加载官方3D模型 ('+done+'/'+total+')', total>0?done/total:0); /* 同步刷新中央进度条 */
      }, function(n,g){
        if(token!==urdfToken)return;   /* 已切换机型则丢弃过期零件 */
        injectMeshGeometry(wrap,fileToLinks[n],g);
      });
    })
    .then(function(list){
      /* 已切换机型：丢弃过期结果。例外：同屏对比预载(comparePreload)不改 currentModel，需放行 */
      if(token!==urdfToken||(currentModel!==m&&comparePreload!==m))return;
      /* 全部零件下载完成：交给 applyUrdf 用全部真实几何做精确归一化并正式上线
         （含缓存、相机适配、自由度显示、减速器预载、提示等所有收尾逻辑） */
      applyUrdf(m, parsed, list, names);
      if(urdfCache[m])urdfCache[m].complete=true;   /* 标记完成，后续切换走秒切缓存 */
      if(comparePreload===m){comparePreload='';}
      if(done)done();
    })
    .catch(function(e){
      if(token!==urdfToken)return;
      if(comparePreload===m){comparePreload='';}
      console.warn('[Robot3D] 官方模型加载失败，使用内置高保真模型:',e);
      var msg=(e&&e.message)?e.message:String(e);
      showLdtip('官方模型加载失败，已用内置模型 ('+msg+')');
      setTimeout(hideLdtip,4000);
      /* 失败时清掉占位骨架，换回美观的内置参数化模型 */
      while(body3d.children.length)body3d.remove(body3d.children[0]);
      buildFallbackRobot(m);
      hideLoading();         /* 隐藏中央加载指示 */
      setTimeout(function(){fitCameraToObject(body3d);},100);
      if(done)done();
    });
}

/* ===== 减速器 STL 预加载（性能优化） =====
   机器人模型加载完成后，后台空闲时把三种减速器拆解场景的 STL 预取到浏览器 HTTP 缓存，
   这样用户点击进入拆解场景时秒开，不用现场下载大体积 STL（摆线约14MB、谐波约4.5MB）。 */
/* 减速器 STL 预加载清单 REDUCER_STL 已移至 js/config.js（E4 拆分） */
var reducerPreloadDone=false;   /* 预加载只执行一次，避免重复下载 */
function preloadReducers(delay){
  if(reducerPreloadDone)return;
  reducerPreloadDone=true;
  /* 延迟 N 秒：等首屏机器人稳定后再后台预取，避免与机器人模型下载抢带宽 */
  setTimeout(function(){
    var i=0;
    function next(){
      if(i>=REDUCER_STL.length)return;
      var u=REDUCER_STL[i++];
      /* 预取到 HTTP 缓存(不解析、不占显存)，真正进入拆解场景时命中缓存秒开。
         优先级与正式加载 stlGeoSmart 一致：.drc → .gz → 原始STL（见 prefetchModel） */
      prefetchModel(u).then(next,next);
    }
    next();
  },delay||3000);
}

/* ===== 三机同屏机型预加载（速度优化） =====
   首屏机器人加载完成后，后台空闲时把三台机型的 URDF+STL 预取到浏览器 HTTP 缓存，
   用户点"三机同屏"时全部命中缓存接近秒开（否则首次需现场串行下载 3 台共百余个 STL，
   每台 16-18MB，慢网络下需数十秒）。纯 fetch 预取（不解析几何、不占显存），
   与减速器预载 preloadReducers 同一套零风险机制。 */
/* 机型预载延迟 PRELOAD_ROBOTS_DELAY 已移至 js/config.js（E4 拆分） */
var robotsPreloadDone=false;    /* 预加载只执行一次，避免重复下载 */
function preloadRobots(delay){
  if(robotsPreloadDone)return;
  robotsPreloadDone=true;
  /* file:// 协议下 fetch 不可用；老浏览器无 fetch 时跳过（正式加载有参数化模型兜底） */
  if(window.__IS_FILE_PROTO__||!window.fetch)return;
  setTimeout(function(){
    var keys=Object.keys(URDF_CFG);   /* x1/h1/g1 三台全预取，保证三机同屏三台全部命中缓存 */
    (function nextRobot(ki){
      if(ki>=keys.length)return;
      var cfg=URDF_CFG[keys[ki]];
      /* 先取 URDF 文本，用与 parseUrdf/loadUrdfRobot 完全相同的规则
         (DOMParser 解析 + .dae→.STL 替换 + visual 网格 + 取 basename)提取 STL 文件名，
         保证预取的 URL 与正式加载请求的 URL 一致，HTTP 缓存才能命中 */
      fetch(cfg.urdf).then(function(r){return r.ok?r.text():'';}).then(function(txt){
        if(!txt)return nextRobot(ki+1);   /* URDF 获取失败：跳过该机型继续下一台 */
        var stls={};
        var doc=new DOMParser().parseFromString(txt,'application/xml');
        Array.prototype.forEach.call(doc.getElementsByTagName('visual'),function(vis){
          var meshEl=vis.getElementsByTagName('mesh')[0];       /* 只取 visual 网格，忽略 collision，与 parseUrdf 一致 */
          var fn=meshEl?meshEl.getAttribute('filename'):null;
          if(fn)stls[fn.replace(/\.dae$/i,'.STL').split('/').pop()]=1;
        });
        var list=Object.keys(stls),i=0;
        (function next(){                 /* 逐个串行预取：不与任何前台下载抢并发 */
          if(i>=list.length)return nextRobot(ki+1);
          var u=cfg.dir+'/'+list[i++];
          prefetchModel(u).then(next,next);   /* 优先级同正式加载(.drc→.gz→原始)，预取到 HTTP 缓存即可，失败忽略继续 */
        })();
      }).catch(function(){nextRobot(ki+1);});
    })(0);
  },delay||PRELOAD_ROBOTS_DELAY);
}

/* 相机自动适配目标物体 */
function fitCameraToObject(obj,skipApply){
  if(!obj)return;
  var bFull=new THREE.Box3().setFromObject(obj);
  if(bFull.isEmpty())return;
  var cFull=bFull.getCenter(new THREE.Vector3());
  var sFull=bFull.getSize(new THREE.Vector3());
  var maxDim=Math.max(sFull.x,sFull.y,sFull.z,1);
  var fov=camera.fov*Math.PI/180;
  var dist=maxDim/(2*Math.tan(fov/2))*1.8;
  /* 保存初始相机参数用于resetView */
  cameraInitTarget=cFull.clone();
  cameraInitPosition=new THREE.Vector3(cFull.x+dist*0.3,cFull.y-dist*0.2,cFull.z+dist*0.9);
  cameraInitMinDist=dist*0.4;
  cameraInitMaxDist=dist*4;
  /* 若用户已拖动过视角则只保存参数、不动相机，避免把用户视角强行拉回 */
  if(skipApply)return;
  controls.target.copy(cFull);
  camera.position.copy(cameraInitPosition);
  controls.minDistance=cameraInitMinDist;
  controls.maxDistance=cameraInitMaxDist;
  controls.update();
}

/* 参数化回退模型（原自制模型，仅在官方 STL 不可用时展示，保证页面永远可用） */
function buildFallbackRobot(m){
  var P=PROP[m]||PROP.h1;
  body3d.scale.set(P.slim,P.h,P.slim);
  body3d.rotation.y=-0.25;

  /* 注意：partGroups 的值必须是【网格数组】（regMesh 会 push），
     这里不能把 Group 存进去，否则后续 regMesh 调用 push 会崩溃 */
  function part(name){var g=new THREE.Group();g.name=name;partGroups[name]=[];body3d.add(g);return g;}
  function cap(r,len,color,metal,rough){
    var me=new THREE.Mesh(new THREE.CapsuleGeometry(r,len,6,14),new THREE.MeshStandardMaterial({color:color,metalness:metal||0.85,roughness:rough||0.28}));
    me.castShadow=true;me.receiveShadow=true;return me;
  }
  function sph(r,color,metal,rough){
    var me=new THREE.Mesh(new THREE.SphereGeometry(r,24,18),new THREE.MeshStandardMaterial({color:color,metalness:metal||0.9,roughness:rough||0.22}));
    me.castShadow=true;return me;
  }
  function box(w,h,d,color,metal,rough){
    var me=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:color,metalness:metal||0.82,roughness:rough||0.32}));
    me.castShadow=true;me.receiveShadow=true;return me;
  }
  function cyl(rTop,rBot,h,color,metal,rough){
    var me=new THREE.Mesh(new THREE.CylinderGeometry(rTop,rBot,h,32),new THREE.MeshStandardMaterial({color:color,metalness:metal||0.85,roughness:rough||0.30}));
    me.castShadow=true;me.receiveShadow=true;return me;
  }
  /* 螺丝细节：小圆柱头 */
  function screw(x,y,z,r){
    var s=cyl(r||0.4,r||0.4,0.6,0x4a5060,0.9,0.25);
    s.position.set(x,y,z);return s;
  }
  /* 散热格栅：一组平行薄片 */
  function grill(w,h,d,count,color){
    var g=new THREE.Group();
    for(var i=0;i<count;i++){
      var v=box(w,0.5,d,color||0x2a3040,0.7,0.5);
      v.position.y=-h/2+0.5+i*(h/(count-1));
      g.add(v);
    }
    return g;
  }

  /* 按部件配色系统上色（工业级金属质感） */
  var C=PART_COLORS;

  /* ========== 躯干 ========== */
  var torso=part('torso');
  /* 躯干主体：圆润倒角盒 */
  var torsoMain=box(12,20,7,C.torso.hex,0.82,0.30);
  torsoMain.position.y=4;
  torso.add(torsoMain); regMesh(torsoMain,'torso');
  /* 胸前面板（深色碳纤维质感） */
  var chestPanel=box(9,12,0.8,0x1e2530,0.6,0.55);
  chestPanel.position.set(0,5,3.6);
  torso.add(chestPanel); regMesh(chestPanel,'torso');
  /* 胸前指示灯/Logo区域 */
  var logoLight=box(3,1.2,0.3,C.sensor.hex,0.3,0.4);
  logoLight.position.set(0,9,4.0);
  torso.add(logoLight); regMesh(logoLight,'sensor');
  /* 躯干螺丝（四角） */
  [[-5,-4,3.6],[5,-4,3.6],[-5,12,3.6],[5,12,3.6]].forEach(function(p){torso.add(screw(p[0],p[1],p[2],0.35));regMesh(torso.children[torso.children.length-1],'torso');});
  /* 背部散热格栅 */
  var backGrill=grill(8,12,0.6,9,0x252d3a);
  backGrill.position.set(0,4,-3.6);
  torso.add(backGrill);
  backGrill.children.forEach(function(c){regMesh(c,'torso');});
  /* 腰部连接环 */
  var waistRing=cyl(4.2,4.5,3,0x6a7588,0.88,0.25);
  waistRing.position.y=-7;
  torso.add(waistRing); regMesh(waistRing,'waist');

  /* ========== 腰部关节 ========== */
  var waist=part('waist');
  var wj=sph(3.4,C.waist.hex,0.88,0.26);
  wj.position.y=-9.5;
  waist.add(wj); regMesh(wj,'waist');
  /* 腰部旋转电机外壳 */
  var waistMotor=cyl(3.8,4.0,4,C.waist.hex,0.85,0.28);
  waistMotor.position.y=-12;
  waist.add(waistMotor); regMesh(waistMotor,'waist');

  /* ========== 颈部 ========== */
  var neck=part('neck');
  var nk=cap(1.4,3,C.waist.hex,0.88,0.25);
  nk.position.y=15.5;
  neck.add(nk); regMesh(nk,'neck');
  /* 颈部2DOF关节球 */
  var neckBall=sph(1.8,C.waist.hex,0.9,0.22);
  neckBall.position.y=17.5;
  neck.add(neckBall); regMesh(neckBall,'neck');

  /* ========== 头部 ========== */
  var head=part('head');
  /* 头部主壳体：胶囊+平面组合 */
  var hb=cap(4.5,6,C.head.hex,0.80,0.30);
  hb.position.y=22;
  head.add(hb); regMesh(hb,'head');
  /* 头部正面面板（面罩） */
  var facePlate=box(6,6,0.6,0x252d3a,0.6,0.5);
  facePlate.position.set(0,21,4.6);
  head.add(facePlate); regMesh(facePlate,'head');
  /* 双眼相机（深蓝玻璃镜头） */
  var eye1=cyl(0.9,0.9,0.4,0x1a2a4a,0.3,0.2);
  eye1.position.set(-1.6,22,5.0);eye1.rotation.x=Math.PI/2;
  head.add(eye1); regMesh(eye1,'sensor');
  var eye2=cyl(0.9,0.9,0.4,0x1a2a4a,0.3,0.2);
  eye2.position.set(1.6,22,5.0);eye2.rotation.x=Math.PI/2;
  head.add(eye2); regMesh(eye2,'sensor');
  /* 镜头反光点 */
  var eyeGlint1=sph(0.25,0x88bbff,0.1,0.1);eyeGlint1.position.set(-1.4,22.3,5.3);head.add(eyeGlint1);regMesh(eyeGlint1,'sensor');
  var eyeGlint2=sph(0.25,0x88bbff,0.1,0.1);eyeGlint2.position.set(1.8,22.3,5.3);head.add(eyeGlint2);regMesh(eyeGlint2,'sensor');
  /* 顶部激光雷达（旋转传感器） */
  var lidarBase=cyl(2.2,2.5,1.5,C.sensor.hex,0.7,0.35);
  lidarBase.position.y=27;
  head.add(lidarBase); regMesh(lidarBase,'sensor');
  var lidarDome=cyl(2.0,2.0,2.5,0x2a4a7a,0.3,0.15);
  lidarDome.position.y=28.5;
  head.add(lidarDome); regMesh(lidarDome,'sensor');
  /* 头部侧面IMU/散热孔 */
  [-3.8,3.8].forEach(function(x){
    var vent=box(0.4,3,1.5,0x1a2030,0.5,0.6);
    vent.position.set(x,22,0);
    head.add(vent); regMesh(vent,'head');
  });
  /* 头顶指示灯条 */
  var statusBar=box(3,0.5,0.5,0x4a90e8,0.3,0.3);
  statusBar.position.set(0,26,3);
  head.add(statusBar); regMesh(statusBar,'sensor');

  /* ========== 肩部（3DOF球铰+电机外壳） ========== */
  var shoulder=part('shoulder');
  [-8,8].forEach(function(x){
    var side=x<0?-1:1;
    /* 肩关节球 */
    var s=sph(2.6,C.shoulder.hex,0.88,0.24);
    s.position.set(x,12.5,0);
    shoulder.add(s);regMesh(s,'shoulder');
    /* 肩电机外壳 */
    var sm=cyl(2.2,2.5,4,C.shoulder.hex,0.85,0.28);
    sm.position.set(x+side*2.5,12.5,0);sm.rotation.z=-side*Math.PI/6;
    shoulder.add(sm);regMesh(sm,'shoulder');
    /* 上臂连杆（碳纤维纹理深色） */
    var ua=cap(1.5,10,C.torso.hex,0.80,0.35);
    ua.position.set(x+side*1.5,3,0);
    shoulder.add(ua);regMesh(ua,'shoulder');
    /* 上臂装饰环 */
    var ring1=cyl(1.7,1.7,0.8,C.shoulder.hex,0.9,0.20);
    ring1.position.set(x+side*1.5,8,0);
    shoulder.add(ring1);regMesh(ring1,'shoulder');
  });

  /* ========== 肘部（1DOF铰链） ========== */
  var elbow=part('elbow');
  [-8,8].forEach(function(x){
    var side=x<0?-1:1;
    /* 肘关节电机 */
    var e=sph(2.0,C.elbow.hex,0.90,0.22);
    e.position.set(x+side*1.5,-5,0);
    elbow.add(e);regMesh(e,'elbow');
    /* 肘电机端盖 */
    var ec=cyl(1.2,1.2,1.6,C.elbow.hex,0.92,0.20);
    ec.position.set(x+side*1.5,-5,side*1.8);ec.rotation.x=Math.PI/2;
    elbow.add(ec);regMesh(ec,'elbow');
    /* 前臂连杆 */
    var fa=cap(1.3,9,C.torso.hex,0.80,0.35);
    fa.position.set(x+side*1.5,-12,0);
    elbow.add(fa);regMesh(fa,'elbow');
  });

  /* ========== 腕部（3DOF球铰） ========== */
  var wrist=part('wrist');
  [-8,8].forEach(function(x){
    var side=x<0?-1:1;
    var w=sph(1.5,C.wrist.hex,0.90,0.22);
    w.position.set(x+side*1.5,-19,0);
    wrist.add(w);regMesh(w,'wrist');
  });

  /* ========== 手部（柔性橡胶） ========== */
  var hand=part('hand');
  [-8,8].forEach(function(x){
    var side=x<0?-1:1;
    /* 手掌 */
    var palm=box(2.5,3.5,1.8,C.hand.hex,0.05,0.9);
    palm.position.set(x+side*1.5,-21.5,0);
    hand.add(palm);regMesh(palm,'hand');
    /* 手指（简化为三段） */
    for(var f=0;f<4;f++){
      var finger=cyl(0.25,0.25,2.2,C.hand.hex,0.0,0.95);
      finger.position.set(x+side*1.5-side*0.9+f*0.6,-24.5,0.6);
      hand.add(finger);regMesh(finger,'hand');
    }
    /* 拇指 */
    var thumb=cyl(0.3,0.3,1.8,C.hand.hex,0.0,0.95);
    thumb.position.set(x+side*3.2,-22,side*0.3);thumb.rotation.z=side*0.5;
    hand.add(thumb);regMesh(thumb,'hand');
  });

  /* ========== 髋部（3DOF球铰） ========== */
  var hip=part('hip');
  [-3.8,3.8].forEach(function(x){
    var side=x<0?-1:1;
    var h=sph(2.8,C.hip.hex,0.88,0.24);
    h.position.set(x,-15,0);
    hip.add(h);regMesh(h,'hip');
    /* 髋部电机外壳 */
    var hm=cyl(2.4,2.6,4.5,C.hip.hex,0.85,0.26);
    hm.position.set(x,-18,0);
    hip.add(hm);regMesh(hm,'hip');
    /* 大腿连杆 */
    var th=cap(2.1,11,C.torso.hex,0.82,0.32);
    th.position.set(x,-26,0);
    hip.add(th);regMesh(th,'hip');
    /* 大腿装饰环 */
    var thighRing=cyl(2.3,2.3,1.0,C.hip.hex,0.9,0.20);
    thighRing.position.set(x,-20,0);
    hip.add(thighRing);regMesh(thighRing,'hip');
  });

  /* ========== 膝关节（1DOF大扭矩） ========== */
  var knee=part('knee');
  [-3.8,3.8].forEach(function(x){
    var side=x<0?-1:1;
    var k=sph(2.3,C.knee.hex,0.88,0.24);
    k.position.set(x,-36,0);
    knee.add(k);regMesh(k,'knee');
    /* 膝电机端盖（侧面突出） */
    var kc=cyl(1.5,1.5,2.2,C.knee.hex,0.90,0.22);
    kc.position.set(x,-36,side*2.2);kc.rotation.x=Math.PI/2;
    knee.add(kc);regMesh(kc,'knee');
    /* 小腿连杆 */
    var sh=cap(1.8,11,C.torso.hex,0.82,0.32);
    sh.position.set(x,-45,0);
    knee.add(sh);regMesh(sh,'knee');
  });

  /* ========== 踝部（2DOF） ========== */
  var ankle=part('ankle');
  [-3.8,3.8].forEach(function(x){
    var a=sph(1.8,C.ankle.hex,0.88,0.26);
    a.position.set(x,-54,0);
    ankle.add(a);regMesh(a,'ankle');
  });

  /* ========== 足部（橡胶脚垫） ========== */
  var foot=part('foot');
  [-3.8,3.8].forEach(function(x){
    /* 脚掌主体 */
    var f=box(5,1.8,9,0x1a1a1f,0.05,0.88);
    f.position.set(x,-56.5,2);
    foot.add(f);regMesh(f,'foot');
    /* 脚踝连接支架 */
    var bracket=box(3,3,3,C.ankle.hex,0.85,0.30);
    bracket.position.set(x,-54.5,1);
    foot.add(bracket);regMesh(bracket,'foot');
    /* 脚底防滑纹 */
    for(var t=0;t<5;t++){
      var tread=box(4.2,0.3,0.8,0x0a0a0f,0.0,0.95);
      tread.position.set(x,-57.5,-1+t*1.8);
      foot.add(tread);regMesh(tread,'foot');
    }
  });
}

function onResize(){
  if(!renderer)return;
  var stg=document.getElementById('stage');
  var w=stg?stg.clientWidth:window.innerWidth, h=stg?stg.clientHeight:window.innerHeight;
  if(!w||!h)return;
  renderer.setSize(w,h,false);
  camera.aspect=w/h; camera.updateProjectionMatrix();
}

function highlight(key){
  if(!built)return;
  if(tdActive)return;  /* 拆解场景模式下机器人隐藏，高亮由拆解场景自身处理 */
  /* 技术知识模块键，这些键选中时机器人整体正常显示 */
  var tech=['foc','loop','ctrl','harmonic','encoder','comm','sensor','triloop','adrc','whole','bom'];
  var isTech = tech.indexOf(key)>=0;
  var selectedSet=new Set();
  if(!isTech && partGroups[key]){
    partGroups[key].forEach(function(msh){selectedSet.add(msh);});
  }
  body3d.traverse(function(o){
    /* 处理实体mesh */
    if(o.isMesh && !o.userData.isWireframe){
      if(isTech || selectedSet.size===0){
        /* 整体/技术模式：全部实体正常显示 */
        o.material.emissive.setHex(0x000000);
        o.material.emissiveIntensity = 0.0;
        o.material.opacity = 1.0;
        o.material.transparent = false;
        o.material.depthWrite = true;
        /* 隐藏线框 */
        if(o.userData.wireframe){
          o.userData.wireframe.material.opacity = 0.0;
        }
      }else if(selectedSet.has(o)){
        /* 选中部件：实体发光高亮 */
        o.material.emissive.setHex(accentHex);
        o.material.emissiveIntensity = 0.5;
        o.material.opacity = 1.0;
        o.material.transparent = false;
        o.material.depthWrite = true;
        /* 隐藏自身线框 */
        if(o.userData.wireframe){
          o.userData.wireframe.material.opacity = 0.0;
        }
      }else{
        /* 非选中部件：半透明柔和显示 + 线框轮廓 */
        o.material.emissive.setHex(0x000000);
        o.material.emissiveIntensity = 0.0;
        o.material.opacity = 0.12;
        o.material.transparent = true;
        o.material.depthWrite = false;
        /* 显示线框轮廓 */
        if(o.userData.wireframe){
          o.userData.wireframe.material.opacity = 0.25;
          o.userData.wireframe.material.color.setHex(0x7a9cc6);
        }
      }
    }
  });
  if(active && key!=='whole' && !isTech)focusOn(key);
  schemeOpacityTouchup();   /* 半透明配色下恢复方案透明参数（部件发光高亮保留） */
}

/* 半透明(ghost)配色与高亮功能的兼容修正：
   highlight/highlightLink 会按选中逻辑改写 opacity/transparent/depthWrite，
   若当前配色方案为半透明，则遍历后统一恢复方案透明参数（发光高亮不受影响） */
function schemeOpacityTouchup(){
  var s=COLOR_SCHEMES[curScheme];
  if(!s||s.opacity>=1.0||!body3d)return;   /* 不透明方案无需修正 */
  body3d.traverse(function(o){
    if(o.isMesh&&!o.userData.isWireframe&&o.material){
      o.material.transparent=true;
      o.material.opacity=s.opacity;
      o.material.depthWrite=s.depthWrite;
    }
  });
}

/* 精确高亮单个具体部件（按 linkName）：3D 点击时只亮被点中的那个关节，而不是整组一起亮 */
function highlightLink(linkName){
  if(!built)return;
  if(tdActive)return;
  var matched=false;
  body3d.traverse(function(o){
    if(o.isMesh && !o.userData.isWireframe){
      if(o.userData.linkName===linkName){
        matched=true;
        /* 被点击的具体部件：发光高亮 */
        o.material.emissive.setHex(accentHex);
        o.material.emissiveIntensity = 0.5;
        o.material.opacity = 1.0;
        o.material.transparent = false;
        o.material.depthWrite = true;
        if(o.userData.wireframe){o.userData.wireframe.material.opacity = 0.0;}
      }else{
        /* 其余部件：半透明弱化 + 线框 */
        o.material.emissive.setHex(0x000000);
        o.material.emissiveIntensity = 0.0;
        o.material.opacity = 0.12;
        o.material.transparent = true;
        o.material.depthWrite = false;
        if(o.userData.wireframe){o.userData.wireframe.material.opacity = 0.25;o.userData.wireframe.material.color.setHex(0x7a9cc6);}
      }
    }
  });
  schemeOpacityTouchup();   /* 半透明配色下恢复方案透明参数（被点部件发光高亮保留） */
  return matched;
}

var tween=null;
function focusOn(key){
  if(!built)return;
  if(tdActive)return;  /* 拆解场景有自己的取景，不参与机器人聚焦 */
  var tech=['foc','loop','ctrl','harmonic','encoder','comm','sensor','triloop','adrc','bom'];
  var meshes=(key!=='whole'&&tech.indexOf(key)<0&&key.indexOf('td_')!==0&&partGroups[key])?partGroups[key]:null;
  var b=new THREE.Box3();
  if(meshes&&meshes.length){meshes.forEach(function(msh){b.expandByObject(msh);});}
  else{b.setFromObject(body3d);}
  if(b.isEmpty()){b.setFromObject(body3d);}
  var c=b.getCenter(new THREE.Vector3());
  var s=b.getSize(new THREE.Vector3());
  var maxd=Math.max(s.x,s.y,s.z,1);
  var dist=maxd*2.0+30;
  var startT=controls.target.clone();
  var startP=camera.position.clone();
  var dir=startP.clone().sub(startT).normalize();
  var endPos=c.clone().add(dir.multiplyScalar(dist));
  var t0=performance.now();
  if(tween)cancelAnimationFrame(tween);
  function step(now){
    var k=Math.min(1,(now-t0)/650);
    var e=k<.5?2*k*k:-1+(4-2*k)*k;
    controls.target.lerpVectors(startT,c,e);
    camera.position.lerpVectors(startP,endPos,e);
    if(k<1)tween=requestAnimationFrame(step); else tween=null;
  }
  tween=requestAnimationFrame(step);
}

function orbit(dx,dy){
  if(!built)return;
  var off=camera.position.clone().sub(controls.target);
  var s=new THREE.Spherical().setFromVector3(off);
  s.theta-=dx*0.02; s.phi-=dy*0.02;
  s.phi=Math.max(0.25,Math.min(Math.PI-0.25,s.phi));
  off.setFromSpherical(s);
  camera.position.copy(controls.target).add(off);
  camera.lookAt(controls.target);
}
function dolly(f){
  if(!built)return;
  var off=camera.position.clone().sub(controls.target);
  var len=off.length()*f;
  len=Math.max(controls.minDistance,Math.min(controls.maxDistance,len));
  off.setLength(len);
  camera.position.copy(controls.target).add(off);
}
function applyTheme(t){
  /* 仅明/暗两种主题：暗色用亮蓝高亮，明色用标准蓝高亮 */
  accentHex=(t==='dark')?0x3b9bff:0x2b8eff;
  if(built&&window.RobotApp)highlight(window.RobotApp.getCur());
}
function setModel(m){
  currentModel=m;
  if(!built)return;
  animDemo=false;  /* 切换机型时停止动画演示 */
  if(compareMode){  /* 对比模式中切机型：退出对比模式（开关+布局），并复位按钮高亮 */
    compareMode=false;
    exitCompareLayout();
    var bc=document.getElementById('bbCompare');if(bc)bc.classList.remove('on');
  }
  buildRobot(m);
  if(window.RobotApp)highlight(window.RobotApp.getCur());
}

/* ==================== X1/H1/G1 三机同屏对比模式 ====================
   把智元 X1(1.30m级)、宇树 H1(1.8m级)、宇树 G1(1.32m级)三台官方模型并排放置，
   按真实相对比例显示（URDF 均为米单位真实尺寸，用同一绝对缩放即得真实身高比），
   关节动画/姿态预设自动同步驱动三机（同名归一化关节同时动），
   直观对比体型、自由度布局与关节构型差异。 */
var compareMode=false;      /* 同屏对比模式开关 */
var comparePreload='';      /* 正在为对比预载的机型（放行 loadUrdfRobot 的 currentModel 守卫） */
/* 对比布局可调参数（调试用宏） */
/* 对比布局参数 CMP_ORDER/CMP_NAMES/CMP_GAP 已移至 js/config.js（E4 拆分） */
function toggleCompare(){
  if(!built)return false;
  if(tdActive)return false;  /* 拆解场景中不开对比（舞台被拆解场景占用） */
  compareMode=!compareMode;
  if(compareMode)enterCompare();
  else exitCompareLayout();
  return compareMode;
}
/* 进入对比：确保三台机型都已加载(串行预载)，然后并排布局 */
function enterCompare(){
  var need=[];
  CMP_ORDER.forEach(function(k){
    if(!(urdfCache[k]&&urdfCache[k].wrap&&urdfCache[k].complete))need.push(k);
  });
  if(!need.length){layoutCompare();return;}
  /* 串行加载缺失机型（loadUrdfRobot 内部 applyUrdf 会临时切显示，最后 layoutCompare 统一布局） */
  showLdtip('正在加载三机对比模型（首次需下载，之后秒开）…');
  (function loadNext(){
    var m=need.shift();
    comparePreload=m;                     /* 放行 loadUrdfRobot 的 currentModel 守卫 */
    loadUrdfRobot(m,function(){
      if(need.length){loadNext();return;}
      if(compareMode)layoutCompare();     /* 全部就绪：布局（若期间用户已关对比则不布局） */
    });
  })();
}
/* 并排布局：三台按真实身高比例(H1=85 单位基准)缩放，每台脚底分别落到同一地面 y=-54 + 相机适配 */
function layoutCompare(){
  var caches=[],fail=false;
  CMP_ORDER.forEach(function(k){
    var c=urdfCache[k];
    if(!c||!c.wrap)fail=true;else caches.push({key:k,c:c});
  });
  if(fail){
    /* 有机型加载失败（无wrap缓存）：退出对比模式并复位按钮，恢复单机显示，避免按钮卡在高亮 */
    compareMode=false;
    var bcf=document.getElementById('bbCompare');if(bcf)bcf.classList.remove('on');
    var bc2f=document.getElementById('btnCompare2');if(bc2f)bc2f.classList.remove('on');
    showLdtip('对比模型加载失败，请检查网络后重试');
    setTimeout(hideLdtip,2600);
    buildRobot(currentModel);
    return;
  }
  while(body3d.children.length)body3d.remove(body3d.children[0]);
  /* 以 H1 的单机归一化缩放为统一绝对比例（H1 显示高度=85 单位，其余机型按真实身高等比） */
  var sH=urdfCache.h1.wrap.scale.x;
  caches.forEach(function(it,i){
    var w=it.c.wrap;
    /* 保存单机原始缩放（applyUrdf 的 85 高度归一化值），退出对比时恢复 */
    if(!w.userData.savedScale)w.userData.savedScale=w.scale.clone();
    w.scale.set(sH,sH,sH);
    /* 三台水平槽位：左(-CMP_GAP) / 中(0) / 右(+CMP_GAP) */
    w.position.set((i-1)*CMP_GAP,0,0);
    body3d.add(w);
  });
  body3d.scale.set(1,1,1);
  body3d.position.set(0,0,0);
  body3d.rotation.y=-0.25;
  /* 关键修复：每台分别计算包围盒把各自脚底落到 y=-54（旧算法用整体包围盒，
     矮机型脚底会悬空；单机落地与旋转无关——绕 y 轴旋转不改变高度） */
  caches.forEach(function(it){
    var bb=new THREE.Box3().setFromObject(it.c.wrap);   /* wrap 当前 position.y=0 时的高度范围 */
    it.c.wrap.position.y=-54-bb.min.y;                  /* 脚底贴地：整体上移到地面 */
  });
  /* 总包围盒只做水平居中（y 已各自落地，body3d.position.y 保持 0） */
  var b=new THREE.Box3().setFromObject(body3d);
  body3d.position.set(-(b.min.x+b.max.x)/2,0,-(b.min.z+b.max.z)/2);
  fitCameraToObject(body3d);
  applyColorScheme(curScheme);   /* 三台机型都挂在 body3d 下，遍历即可统一换色 */
  showLdtip('三机同屏：左 '+CMP_NAMES[CMP_ORDER[0]]+' · 中 '+CMP_NAMES[CMP_ORDER[1]]+' · 右 '+CMP_NAMES[CMP_ORDER[2]]+'（按真实身高比例，脚踩同一地面），关节动画已同步；再点一次退出');
  setTimeout(hideLdtip,3600);
  /* 关节零位复位，避免单机型动画残留角度 */
  resetAllJoints();
}
/* 退出对比：恢复各 wrap 的位置/缩放，重建当前机型单机显示 */
function exitCompareLayout(){
  CMP_ORDER.forEach(function(k){
    var c=urdfCache[k];
    if(c&&c.wrap){
      c.wrap.position.set(0,0,0);
      if(c.wrap.userData.savedScale)c.wrap.scale.copy(c.wrap.userData.savedScale);
    }
  });
  buildRobot(currentModel);   /* 缓存命中路径恢复单机型显示与相机 */
}

var ray, ptr;
var downX=0,downY=0;
function onDown(e){downX=e.clientX;downY=e.clientY;}
function onClick(e){
  if(Math.hypot(e.clientX-downX,e.clientY-downY)>6)return;  /* 拖拽超过阈值不算点击 */
  var r=renderer.domElement.getBoundingClientRect();
  ptr.x=((e.clientX-r.left)/r.width)*2-1;
  ptr.y=-((e.clientY-r.top)/r.height)*2+1;
  ray.setFromCamera(ptr,camera);
  /* 拆解场景模式：拾取拆解零件并显示零件详解卡片 */
  if(tdActive&&tdGroup){
    var th=ray.intersectObjects(tdGroup.children,true);
    if(th.length){
      var to=th[0].object;
      while(to){if(to.userData&&to.userData.tdId){onTdPartClick(to.userData.tdId);return;}to=to.parent;}
    }
    return;
  }
  var hits=ray.intersectObjects(body3d.children,true);
  if(!hits.length){
    /* 点击空白处（未命中任何部件）：取消选中并回到整机总览。
       本函数开头已有位移阈值判断，拖动视角后松开不会走到这里，避免误重置 */
    if(window.RobotApp)window.RobotApp.selectPart('whole');
    if(window.Robot3D)window.Robot3D.resetView();
    return;
  }
  /* 沿父链查找部件键（真实 URDF 模型的网格带 userData.partKey 标记） */
  var o=hits[0].object;
  while(o){
    if(o.userData&&o.userData.partKey){
      if(window.RobotApp)window.RobotApp.selectPart(o.userData.partKey);
      /* 精确高亮被点击的那个具体关节（否则点击髋关节会左右腿一起亮） */
      if(o.userData.linkName&&window.Robot3D&&window.Robot3D.highlightLink)window.Robot3D.highlightLink(o.userData.linkName);
      return;
    }
    o=o.parent;
  }
}

var _szW=0,_szH=0;   /* 舞台尺寸自检:iOS 布局延迟/地址栏伸缩时自动修正 canvas 尺寸 */
function loop(){
  /* 【移动端尺寸自检】每帧对比舞台实际尺寸,变化则重算渲染尺寸与相机宽高比
     (iOS Safari 地址栏伸缩/布局延迟常导致初始尺寸错误,点按钮后"突然出现"即此原因) */
  var _st=document.getElementById('stage');
  if(_st){
    var _w=_st.clientWidth,_h=_st.clientHeight;
    if(_w&&_h&&(_w!==_szW||_h!==_szH)){_szW=_w;_szH=_h;onResize();}
  }
  /* 拆解场景动画驱动：顺序拆解动画 > 自动拆解（往返/单向）> 旋转展示 */
  if(tdActive){
    if(tdSeqOn){
      /* 顺序拆解动画：按真实拆解顺序逐个零件飞出→停顿→逆序装回，循环播放 */
      tdSeqT+=TD_SEQ_STEP;
      var prog=applyTdExplodeSeq(tdSeqT);
      var rgS=document.getElementById('exrng');if(rgS)rgS.value=Math.round(prog*100);
    }
    if(tdAutoOn){
      if(tdExplodeTarget!==null){
        /* 单向爆炸/装配模式（底部栏"爆炸拆解"按钮）：朝目标爆炸度平滑移动，到达后停止 */
        var step=0.012; /* 每帧爆炸度步进量 */
        if(tdExplodeT<tdExplodeTarget){tdExplodeT=Math.min(tdExplodeTarget,tdExplodeT+step);}
        else{tdExplodeT=Math.max(tdExplodeTarget,tdExplodeT-step);}
        if(Math.abs(tdExplodeT-tdExplodeTarget)<0.002){tdExplodeT=tdExplodeTarget;tdAutoOn=false;tdExplodeTarget=null;}
      }else{
        /* 自动往返演示模式（"自动演示"按钮）：爆炸度到顶反向、到底反向 */
        tdExplodeT+=tdAutoDir*0.006;                 /* 每帧推进爆炸度 */
        if(tdExplodeT>=1){tdExplodeT=1;tdAutoDir=-1;}/* 到顶反向 */
        if(tdExplodeT<=0){tdExplodeT=0;tdAutoDir=1;} /* 到底反向 */
      }
      applyTdExplode(tdExplodeT);
      var rg=document.getElementById('exrng');if(rg)rg.value=Math.round(tdExplodeT*100);
    }
    if(tdSpinOn&&tdGroup)tdGroup.rotation.y+=0.006;/* 拆解场景自动旋转 */
  }
  /* 整机自动旋转（非拆解模式、非关节动画时） */
  if(!tdActive&&autoRotate&&body3d){
    body3d.rotation.y+=AUTO_ROTATE_SPEED;
  }
  /* 整机关节动画演示（非拆解模式）：拟人原地步态 */
  if(!tdActive&&animDemo&&urdfRoot){
    animTime+=0.016;
    /* 拟人步态：左右腿相位差π，手臂与同侧腿反相摆动，膝/踝随动补偿；
       躯干上下起伏(质心 bob)与重心侧移增强真实行走感；
       所有目标角经 setJointAngle 二次夹紧在关节限位内，平滑系数保证无跳变 */
    var gaitPhase=animTime*2*Math.PI/GAIT_PERIOD; /* 左腿相位基准 */
    /* 躯干起伏：双支撑相最低、单支撑相最高（每半步一个波峰，幅度 GAIT_BOB_AMP 场景单位≈4cm） */
    body3d.position.y=GAIT_BOB_AMP*0.5*(1-Math.cos(2*gaitPhase));
    Object.keys(urdfJoints).forEach(function(jn){
      var j=urdfJoints[jn];
      if(!j||!j.group)return;
      var nf=normJoint(jn);
      if(!nf.type)return;
      /* 左侧相位φ，右侧相位φ+π（左右腿/臂交替），中央(腰)相位φ */
      var ph=(nf.side==='r')?gaitPhase+Math.PI:gaitPhase;
      var tgt=null;
      switch(nf.type){
        /* 下肢：摆腿-屈膝-蹬地踝补偿，构成行走主循环 */
        case 'hip_pitch':   tgt=Math.sin(ph)*GAIT_LEG_AMP; break;                      /* 髋前后摆腿 */
        case 'knee':        tgt=GAIT_KNEE_BASE+GAIT_KNEE_AMP*0.5*(1+Math.sin(ph-0.6)); break; /* 摆动相屈膝(滞后摆腿) */
        case 'ankle_pitch': tgt=-Math.sin(ph+1.9)*GAIT_ANKLE_AMP; break;              /* 踝俯仰补偿：摆动相背伸+落地缓冲 */
        case 'ankle_roll':  tgt=0.06*Math.sin(ph); break;                              /* 踝微侧摆 */
        case 'hip_roll':    tgt=0.09*Math.sin(ph); break;                              /* 髋微侧摆(重心转移更明显) */
        case 'hip_yaw':     tgt=0.05*Math.sin(ph); break;                              /* 髋微内旋 */
        /* 上肢：手臂与同侧腿反相摆动（自然行走姿态），肘部微屈随动 */
        case 'shoulder_pitch': tgt=Math.sin(ph+Math.PI)*GAIT_ARM_AMP; break;           /* 摆臂 */
        case 'shoulder_roll':  tgt=(nf.side==='l'?1:-1)*0.09; break;                   /* 自然小外张 */
        case 'shoulder_yaw':   tgt=0.04*Math.sin(ph+Math.PI); break;                   /* 肩微内旋 */
        case 'elbow':       tgt=GAIT_ELBOW_BASE+GAIT_ELBOW_AMP*0.5*(1+Math.sin(ph+Math.PI)); break; /* 屈肘随动 */
        case 'elbow_yaw':   tgt=0.05*Math.sin(ph); break;                              /* 前臂微旋 */
        /* 躯干：腰部随步态轻微扭转/起伏，增强拟人感 */
        case 'waist_yaw':   tgt=Math.sin(gaitPhase)*GAIT_WAIST_AMP; break;             /* 腰随摆臂反扭 */
        case 'waist_pitch': tgt=0.06*Math.sin(2*gaitPhase)+0.03; break;                /* 步频两倍起伏+轻微前倾 */
        case 'waist_roll':  tgt=0.05*Math.sin(gaitPhase); break;                       /* 腰微侧倾 */
        /* wrist / hand 不参与步态，保持零位 */
      }
      if(tgt===null)return;
      /* 惯性平滑：关节角从当前值向目标渐进过渡，杜绝硬切跳变 */
      if(j.gaitCur===undefined)j.gaitCur=0;
      j.gaitCur+=(tgt-j.gaitCur)*GAIT_SMOOTH;
      setJointAngle(jn,j.gaitCur);
    });
  }
  controls.update();
  renderer.render(scene,camera);
  raf=requestAnimationFrame(loop);
}
function resume(){if(!built||raf)return;loop();}
function pause(){if(raf){cancelAnimationFrame(raf);raf=null;}}

/* ==================== 关节控制系统 ==================== */
/* 关节名归一化：把 X1/H1/G1 三种机型的关节命名（urdfJoints 键=URDF child link 名）
   统一映射为 {side:'l'|'r'|'c', type:'部位_自由度'}，拟人步态与姿态预设均基于
   归一化结果驱动，任一机型缺失的关节自动跳过（找不到就不动，绝不报错） */
function normJoint(jn){
  /* 侧别：X1/H1/G1 均以 left_/right_ 前缀区分左右，H1手指用 L_/R_ 前缀 */
  var side=/^left|^l_/.test(jn)?'l':(/^right|^r_/.test(jn)?'r':'c');
  var t=null;
  if(/shoulder_pitch/.test(jn))t='shoulder_pitch';
  else if(/shoulder_roll/.test(jn))t='shoulder_roll';
  else if(/shoulder_yaw/.test(jn))t='shoulder_yaw';
  else if(/elbow_yaw/.test(jn))t='elbow_yaw';        /* X1 前臂旋转 */
  else if(/elbow/.test(jn))t='elbow';                /* H1/G1 单肘关节 */
  else if(/wrist/.test(jn))t='wrist';
  else if(/hip_pitch/.test(jn))t='hip_pitch';
  else if(/hip_roll/.test(jn))t='hip_roll';
  else if(/hip_yaw/.test(jn))t='hip_yaw';
  else if(/knee/.test(jn))t='knee';
  else if(/ankle_roll/.test(jn))t='ankle_roll';
  else if(/ankle/.test(jn))t='ankle_pitch';          /* H1 为单踝关节 */
  else if(/lumber_yaw|waist_yaw/.test(jn))t='waist_yaw';
  else if(/lumber_roll|waist_roll/.test(jn))t='waist_roll';
  else if(/lumber_pitch|waist_pitch/.test(jn))t='waist_pitch';
  else if(/torso/.test(jn))t=(currentModel==='h1')?'waist_yaw':'waist_pitch'; /* H1的torso关节为偏航(yaw)，G1的torso_link为俯仰(pitch) */
  else if(/hand|thumb|index|middle|ring|pinky/.test(jn))t='hand';
  return {side:side,type:t};
}
/* 按归一化特征反查关节名（side:'l'|'r'|'c'，type 同上），找不到返回 null */
function findJ(side,type){
  for(var jn in urdfJoints){
    var nf=normJoint(jn);
    if(nf.side===side&&nf.type===type)return jn;
  }
  return null;
}
/* 按归一化特征设置关节角度（姿态预设用，兼容三机型命名） */
function setPose(side,type,angRad){
  var jn=findJ(side,type);
  if(jn)setJointAngle(jn,angRad);
}
/* 设置单个关节角度（弧度，相对于零位）
   同屏对比模式下额外驱动另一机型的等效关节（按归一化特征 side+type 匹配），
   实现两机步态动画与姿态预设的镜像同步 */
function setJointAngle(jointName,angleRad){
  applyJointAngle(urdfJoints,jointName,angleRad);   /* 当前查询机型关节表 */
  if(compareMode){
    CMP_ORDER.forEach(function(k){                  /* 对比中的三台机型 */
      var jm=urdfCache[k]&&urdfCache[k].joints;
      if(!jm||jm===urdfJoints)return;               /* 未加载或即当前查询机型则跳过 */
      var nf=normJoint(jointName);
      if(!nf.type)return;                           /* 无法归一化的关节不同步 */
      for(var jn in jm){                            /* 在其他机型找等效关节 */
        var nf2=normJoint(jn);
        if(nf2.side===nf.side&&nf2.type===nf.type){applyJointAngle(jm,jn,angleRad);return;}
      }
    });
  }
}
/* 对指定机型关节表设置单个关节角度（setJointAngle 的实际执行体，可复用到任意机型） */
function applyJointAngle(map,jointName,angleRad){
  var j=map[jointName];
  if(!j||!j.group||!j.zero)return;
  /* 夹紧到限位范围内 */
  var a=Math.max(j.min,Math.min(j.max,angleRad));
  /* 绕关节轴旋转，叠加在零位四元数上 */
  var axis;
  if(j.axis==='x')axis=new THREE.Vector3(1,0,0);
  else if(j.axis==='y')axis=new THREE.Vector3(0,1,0);
  else axis=new THREE.Vector3(0,0,1);
  var dq=new THREE.Quaternion().setFromAxisAngle(axis,a);
  j.group.quaternion.copy(j.zero).multiply(dq);
}
/* 复位所有关节到零位（标准站立姿态）
   对比模式下连另一机型一起复位，避免退出对比时残留动画角度 */
function resetAllJoints(){
  animDemo=false;
  var btn=document.getElementById('btnAnim2');
  if(btn)btn.classList.remove('active');
  resetJointMap(urdfJoints);                        /* 当前查询机型 */
  if(compareMode){                                  /* 对比模式：其他机型同步复位 */
    CMP_ORDER.forEach(function(k){
      var jm=urdfCache[k]&&urdfCache[k].joints;
      if(jm&&jm!==urdfJoints)resetJointMap(jm);
    });
  }
}
/* 复位指定机型关节表内全部关节到零位（resetAllJoints 的实际执行体） */
function resetJointMap(map){
  Object.keys(map).forEach(function(jn){
    var j=map[jn];
    if(j){
      j.gaitCur=0; /* 清除步态平滑残留角度，下次动画从零位渐入 */
      if(j.group&&j.zero)j.group.quaternion.copy(j.zero);
    }
  });
  /* 步态躯干起伏复位：动画关闭/姿态切换时机器人回到地面高度 */
  if(body3d)body3d.position.y=0;
}
/* 切换动画演示开关 */
function toggleAnimDemo(){
  animDemo=!animDemo;
  var btn=document.getElementById('btnAnim2');
  if(btn)btn.classList.toggle('active',animDemo);
  if(!animDemo)resetAllJoints();
}
/* 姿态预设：举手礼（左臂前举过头，右臂自然下垂）
   角度经 setJointAngle 自动夹紧在各机型关节限位内 */
function poseWaveHand(){
  resetAllJoints();
  setTimeout(function(){
    setPose('l','shoulder_pitch',-1.7); /* 左臂前举过头 */
    setPose('l','shoulder_roll',0.25);  /* 肩微外展 */
    setPose('l','elbow',0.9);           /* 屈肘行礼 */
    setPose('r','shoulder_pitch',0.1);  /* 右臂自然下垂微后摆 */
    setPose('r','elbow',0.15);          /* 右肘微屈 */
  },50);
}
/* 姿态预设：大字站立（双臂水平外展） */
function poseTpose(){
  resetAllJoints();
  setTimeout(function(){
    setPose('l','shoulder_roll',1.5);   /* 左臂外展(正向外展) */
    setPose('r','shoulder_roll',-1.5);  /* 右臂外展(负向外展) */
    setPose('l','elbow',0.1);           /* 双肘伸直微屈 */
    setPose('r','elbow',0.1);
  },50);
}
/* 姿态预设：半蹲（屈髋屈膝+踝背伸+双臂前平举配重） */
function poseSquat(){
  resetAllJoints();
  setTimeout(function(){
    setPose('l','hip_pitch',0.5);setPose('r','hip_pitch',0.5);     /* 屈髋 */
    setPose('l','knee',0.9);setPose('r','knee',0.9);               /* 屈膝 */
    setPose('l','ankle_pitch',0.4);setPose('r','ankle_pitch',0.4); /* 踝背伸保持全脚掌着地 */
    setPose('l','shoulder_pitch',-0.5);setPose('r','shoulder_pitch',-0.5); /* 双臂前平举 */
    setPose('l','elbow',0.3);setPose('r','elbow',0.3);             /* 微屈肘 */
  },50);
}

/* ==================== 拆解教学 3D 场景系统 ==================== */
var tdGroup=null;        /* 当前拆解场景根节点 */
var tdActive=false;      /* 是否处于拆解场景模式 */
var tdKey='';            /* 当前拆解模块键 */
var tdParts=[];          /* 零件列表 {obj,base(装配位),dir(爆炸方向),dist(爆炸距离),id} */
var tdExplodeT=0;        /* 当前爆炸度 0(装配)~1(完全拆解) */
var tdAutoOn=false,tdAutoDir=1,tdSpinOn=false,tdExplodeTarget=null;
/* 顺序拆解动画状态：tdSeqOn=开关；tdSeqT=动画进度(零件个数为单位，0~n 拆解、n~2n+停顿 装配) */
var tdSeqOn=false,tdSeqT=0;
/* 顺序拆解可调参数 TD_SEQ_STEP/TD_SEQ_HOLD 已移至 js/config.js（E4 拆分） */
var labelsVisible=true;   /* 拆解场景零件标签是否可见（底部栏"零件标签"开关） */
var tdSelId=null;        /* 当前选中的零件 id */
var savedCam={min:55,max:200};  /* 进入拆解场景前保存的相机距离限制 */
var tdCamSaved=false;    /* 标记相机限制是否已保存（拆解场景间直接切换时不重复保存） */

/* 拆解零件详解词典 TD_INFO 已移至 js/config.js（E4 拆分，50 词条） */

/* 拆解场景材质（每个网格独立材质，保证点击高亮互不干扰）
   【优化】默认半透明(opacity:0.92)：爆炸后零件前后重叠时也能透视看清后方零件 */
function tdMat(color,metal,rough){return new THREE.MeshStandardMaterial({color:color,metalness:(metal==null)?0.55:metal,roughness:(rough==null)?0.4:rough,transparent:true,opacity:0.92});}

/* 几何体居中（包围盒中心移到原点）并返回原尺寸 */
function centerGeo(geo){
  geo.computeBoundingBox();
  var c=new THREE.Vector3();
  geo.boundingBox.getCenter(c);
  geo.translate(-c.x,-c.y,-c.z);
  var s=new THREE.Vector3();
  geo.boundingBox.getSize(s);
  return s;
}

/* 加载单个真实 STL 零件并缩放到指定尺寸；失败回调 null 由调用方换参数化零件
   axis：可选，原始 STL 的厚度轴（'x'/'y'/'z'），传入则先把厚度轴旋转对齐到 Y 再缩放 */
function tdLoadSTL(url,size,cb,axis){
  if(!STLLoader){cb(null);return;}
  stlGeoSmart(url).then(function(geo){   /* 优先 .gz 压缩版，失败自动回退原始 STL */
    try{
      var s=centerGeo(geo);
      var k=size/Math.max(s.x,s.y,s.z,0.001);  /* 等比缩放到目标尺寸 */
      var msh=new THREE.Mesh(geo,tdMat(0xc8cfd9));
      if(axis==='x')msh.rotation.z=-Math.PI/2;   /* 厚度 X→Y */
      else if(axis==='z')msh.rotation.x=Math.PI/2;/* 厚度 Z→Y */
      msh.scale.set(k,k,k);
      msh.castShadow=true;msh.receiveShadow=true;
      cb(msh);
    }catch(e){cb(null);}
  }).catch(function(){cb(null);});   /* 压缩版与原始版都失败：交回退零件 */
}

/* 参数化回退零件工厂：圆柱 / 立环（轴线竖直） */
function fbCyl(r,h,color){return function(){return new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,48),tdMat(color||0xc8cfd9));};}
function fbRing(r,tube,color){return function(){var m=new THREE.Mesh(new THREE.TorusGeometry(r,tube,16,48),tdMat(color||0x9aa4b2));m.rotation.x=Math.PI/2;return m;};}

/* 行星轮组（参数化）：n 个行星轮均布 + 下方行星架圆盘 */
function mkPlanets(radius,pr,n){
  return function(){
    var g=new THREE.Group();
    for(var i=0;i<n;i++){
      var a=i*Math.PI*2/n;
      var m=new THREE.Mesh(new THREE.CylinderGeometry(pr,pr,4.5,24),tdMat(0xb8c0cc));
      m.position.set(Math.cos(a)*radius,0,Math.sin(a)*radius);
      m.castShadow=true;
      g.add(m);
    }
    var plate=new THREE.Mesh(new THREE.CylinderGeometry(radius+pr+1.5,radius+pr+1.5,1.2,48),tdMat(0x8a94a4));
    plate.position.y=-2.8;   /* 行星架在行星轮下方 */
    plate.castShadow=true;
    g.add(plate);
    return g;
  };
}
/* RV 偏心轴（参数化）：直轴 + 偏心凸轮 */
function mkEccentric(){
  var g=new THREE.Group();
  var shaft=new THREE.Mesh(new THREE.CylinderGeometry(2,2,6,24),tdMat(0xb8c0cc));
  var cam=new THREE.Mesh(new THREE.CylinderGeometry(3.2,3.2,2,24),tdMat(0x8a94a4));
  cam.position.set(1.2,0,0);  /* 偏心距 e */
  shaft.castShadow=true;cam.castShadow=true;
  g.add(shaft);g.add(cam);
  return g;
}
/* RV 针齿圈（参数化）：环形基体 + 一圈圆柱针齿 */
function mkPinRing(){
  var g=new THREE.Group();
  var ring=new THREE.Mesh(new THREE.TorusGeometry(13,1.6,16,48),tdMat(0x9aa4b2));
  ring.rotation.x=Math.PI/2;
  ring.castShadow=true;
  g.add(ring);
  for(var i=0;i<12;i++){
    var a=i*Math.PI*2/12;
    var pin=new THREE.Mesh(new THREE.CylinderGeometry(0.9,0.9,5,16),tdMat(0xd8dee8));
    pin.position.set(Math.cos(a)*13,0,Math.sin(a)*13);
    pin.castShadow=true;
    g.add(pin);
  }
  return g;
}
/* RV 输出法兰（参数化）：圆盘 + 三根曲柄销 */
function mkOutFlange(){
  var g=new THREE.Group();
  var disc=new THREE.Mesh(new THREE.CylinderGeometry(11,11,2,48),tdMat(0xd8dee8,0.7,0.3));
  disc.castShadow=true;
  g.add(disc);
  for(var i=0;i<3;i++){
    var a=i*Math.PI*2/3;
    var pin=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,3.5,20),tdMat(0x8a94a4));
    pin.position.set(Math.cos(a)*6,2.2,Math.sin(a)*6);
    pin.castShadow=true;
    g.add(pin);
  }
  return g;
}

/* 沿 Y 轴把零件列表自上而下堆叠（装配态），间距自适应 */
function tdStack(items){
  var gap=(items.length>6)?1.2:2.0;
  var totalH=0;
  items.forEach(function(it){totalH+=it.h;});
  totalH+=gap*(items.length-1);
  var y=totalH/2;
  items.forEach(function(it){
    y-=it.h/2;
    it.obj.position.set(0,y,0);
    y-=it.h/2+gap;
  });
}

/* 注册一个可拆解零件：记录装配位置、爆炸方向与距离 */
function addTdPart(obj,id,dir,dist){
  obj.userData.tdId=id;
  tdGroup.add(obj);
  tdParts.push({obj:obj,base:obj.position.clone(),dir:dir.clone().normalize(),dist:dist,id:id});
}

/* 应用爆炸度 t(0~1)：所有零件沿各自方向平移 */
function applyTdExplode(t){
  tdExplodeT=t;
  tdParts.forEach(function(p){
    p.obj.position.copy(p.base).addScaledVector(p.dir,p.dist*t);
  });
}

/* 应用顺序拆解动画进度 s（单位=零件个数）：
   拆解段 s∈[0,n]   ——零件 i 依次飞出：t_i = clamp(s-i,0,1)（按加入顺序=真实拆解顺序）；
   停顿段 s∈[n,n+H] ——全部保持完全拆解；
   装配段 s>n+H     ——装配是拆解的逆序：后拆的先装回，t_i = clamp((n-i)-(s-n-H),0,1)。
   返回当前"整体完成度"(0~1) 用于同步滑杆显示 */
function applyTdExplodeSeq(s){
  var n=tdParts.length;
  if(!n)return 0;
  var hold=n+TD_SEQ_HOLD;
  var total=hold+n;
  if(s>=total){s=0;}   /* 一轮拆+装结束：回到起点循环 */
  var a;
  if(s<=n){a=s;}                       /* 拆解段 */
  else if(s<=hold){a=n;}               /* 停顿段 */
  else{a=hold+n-s;}                    /* 装配段（整体进度回落） */
  tdParts.forEach(function(p,i){
    var t;
    if(s<=n){t=Math.max(0,Math.min(1,s-i));}                    /* 逐个飞出 */
    else if(s<=hold){t=1;}                                      /* 保持全拆 */
    else{t=Math.max(0,Math.min(1,(n-i)-(s-hold)));}             /* 逆序装回 */
    p.obj.position.copy(p.base).addScaledVector(p.dir,p.dist*t);
  });
  tdExplodeT=a/n;      /* 同步整体爆炸度，供滑杆/按钮状态判断 */
  return a/n;
}

/* 通用拆解场景构建器：defs=[{id,h,mk(零件工厂),stl?(真实STL路径),stlSize?(目标尺寸)}] */
function buildTdFromDefs(defs,done){
  var items=[],stlJobs=[];
  defs.forEach(function(d){
    var g=new THREE.Group();
    var m=d.mk();
    if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}
    g.add(m);
    /* 为每个零件创建3D文字标签 */
    var partName=(TD_INFO[d.id]&&TD_INFO[d.id].n)?TD_INFO[d.id].n:d.id;
    var label=createPartLabel(partName,new THREE.Vector3(0,0,0));
    if(label){
      /* 标签位置：放在零件右侧（X轴正方向偏移） */
      label.position.set(18,0,0);
      label.userData.tdLabelFor=d.id;
      g.add(label);
    }
    items.push({obj:g,h:d.h,id:d.id});
    if(d.stl)stlJobs.push({g:g,mesh:m,url:d.stl,size:d.stlSize||24,id:d.id,axis:d.stlAxis});
  });
  tdStack(items);
  /* 【优化】爆炸方向：三维螺旋式展开，避免零件重叠遮挡
     每个零件沿径向(XZ平面)旋转 + 轴向(Y轴)分层，距离随远离中心递增 */
  var mid=(items.length-1)/2;
  items.forEach(function(it,i){
    var dirY=(i<=mid)?1:-1;
    var spread=10+Math.abs(i-mid)*8;
    /* 径向偏移角度：根据 i 旋转，使零件在 XZ 平面错开 */
    var angle=i*Math.PI*0.55;
    var radialX=Math.sin(angle)*spread*0.3;
    var radialZ=Math.cos(angle)*spread*0.3;
    var dir=new THREE.Vector3(radialX,dirY*spread*0.7,radialZ).normalize();
    addTdPart(it.obj,it.id,dir,spread);
  });
  /* 异步用真实开源 STL 替换对应参数化零件；全部失败也不影响场景可用性 */
  var pending=stlJobs.length;
  if(!pending){done();return;}
  stlJobs.forEach(function(job){
    tdLoadSTL(job.url,job.size,function(msh){
      if(msh){
        msh.userData.tdId=job.id;
        job.g.remove(job.mesh);   /* 移除参数化替身 */
        job.g.add(msh);           /* 换上真实模型 */
      }
      if(--pending===0)done();
    },job.axis);
  });
}

/* 场景1：一体化关节模组（10 个核心零件，谐波三件套为真实开源 STL）
   同心装配：柔轮/波发生器/刚轮、转子/定子同心嵌套，法兰/轴承/编码器/PCB 沿轴堆叠。
   爆炸为纯轴向上下分离，不再用旧版"堆叠+螺旋"导致装配松散、爆炸乱飞。 */
function buildTdJoint(done){
  var defs=[
    {id:'j_flange', yBase:-30, yExp:-45, mk:function(){return new THREE.Mesh(new THREE.CylinderGeometry(13,13,2.6,48),tdMat(0xd8dee8,0.7,0.3));}},
    {id:'j_bearing',yBase:-22, yExp:-34, mk:fbRing(10.5,1.9,0xb8c0cc)},
    {id:'j_fs',     yBase:-12, yExp:-24, mk:fbCyl(9.5,7),stl:'models/harmonic_htm/FlexSpline.STL',stlSize:26,stlAxis:'x'},
    {id:'j_wg',     yBase:-8,  yExp:-14, mk:function(){var m=new THREE.Mesh(new THREE.CylinderGeometry(7,7,3.5,48),tdMat(0x8a94a4));m.scale.x=1.35;return m;},stl:'models/harmonic_htm/WaveGenerator.STL',stlSize:22,stlAxis:'z'},
    {id:'j_cs',     yBase:-6,  yExp:-2,  mk:fbRing(11,2.4),stl:'models/harmonic_htm/CircularSpline.STL',stlSize:26,stlAxis:'x'},
    {id:'j_enc_out',yBase:2,   yExp:8,   mk:fbCyl(9,1,0x2f6db3)},
    {id:'j_rotor',  yBase:12,  yExp:20,  mk:fbCyl(7.5,9,0x3a404c)},
    {id:'j_stator', yBase:12,  yExp:34,  mk:fbCyl(11.5,10.5,0xb0763a)},
    {id:'j_enc_mot',yBase:22,  yExp:42,  mk:fbCyl(6,1,0x2f6db3)},
    {id:'j_pcb',    yBase:28,  yExp:52,  mk:function(){return new THREE.Mesh(new THREE.BoxGeometry(19,1.6,13),tdMat(0x2e7d4f,0.2,0.7));}}
  ];
  var items=[],stlJobs=[];
  defs.forEach(function(d){
    var g=new THREE.Group();
    var m=d.mk();
    if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}
    g.add(m);
    var partName=(TD_INFO[d.id]&&TD_INFO[d.id].n)?TD_INFO[d.id].n:d.id;
    var label=createPartLabel(partName,new THREE.Vector3(0,0,0));
    if(label){label.position.set(20,0,0);label.userData.tdLabelFor=d.id;g.add(label);}
    items.push({obj:g,id:d.id,yBase:d.yBase,yExp:d.yExp});
    if(d.stl)stlJobs.push({g:g,mesh:m,url:d.stl,size:d.stlSize||24,id:d.id,axis:d.stlAxis});
  });
  /* 装配态：同心零件在各自 yBase 嵌套，轴向零件沿 Y 堆叠 */
  items.forEach(function(it){it.obj.position.set(0,it.yBase,0);});
  /* 爆炸态：纯轴向(沿 Y)上下分离，整齐不散乱 */
  items.forEach(function(it){
    var dy=it.yExp-it.yBase;
    var dir=new THREE.Vector3(0,Math.sign(dy)||1,0);
    addTdPart(it.obj,it.id,dir,Math.abs(dy));
  });
  /* 异步用真实 STL 替换谐波三件套参数化替身；失败也不影响场景可用 */
  var pending=stlJobs.length;
  if(!pending){done();return;}
  stlJobs.forEach(function(job){
    tdLoadSTL(job.url,job.size,function(msh){
      if(msh){
        msh.userData.tdId=job.id;
        job.g.remove(job.mesh);
        job.g.add(msh);
      }
      if(--pending===0)done();
    },job.axis);
  });
}

/* 场景2：谐波减速器（10 个零件全部为 howtomechatronics 开源 SolidWorks 真实 STL）
   同轴装配：柔轮/波发生器/刚轮/壳体同心嵌套，输入输出轴与电机座沿轴堆叠，保持真实比例。
   axis=该 STL 的厚度轴(见 tdLoadAxis)；yBase=装配态中心Y；yExp=爆炸态中心Y。 */
function buildTdHarmonic(done){
  var parts=[
    {id:'h_output', file:'models/harmonic_htm/OutputShaft.STL',    axis:'y', yBase:-28, yExp:-44, color:0xc8cfd9},
    {id:'h_base',   file:'models/harmonic_htm/HousingBottom.STL',  axis:'z', yBase:-19, yExp:-34, color:0x9aa4b2},
    /* 柔轮：杯体(高30mm)下沉到刚轮(高17mm)下方，让杯体外壁露出可见；杯口上沿与刚轮下沿少量重叠示意啮合 */
    {id:'h_fs',     file:'models/harmonic_htm/FlexSpline.STL',     axis:'x', yBase:-9,  yExp:-24, color:0x7aa7ff},
    {id:'h_wg',     file:'models/harmonic_htm/WaveGenerator.STL',  axis:'z', yBase:-5,  yExp:-14, color:0xffd479},
    {id:'h_cs',     file:'models/harmonic_htm/CircularSpline.STL', axis:'x', yBase:9,   yExp:18,  color:0x8a94a4},
    {id:'h_support',file:'models/harmonic_htm/SupportShaft.STL',   axis:'z', yBase:19,  yExp:30,  color:0x9aa4b2},
    {id:'h_housing',file:'models/harmonic_htm/Housing.STL',        axis:'z', yBase:27,  yExp:42,  color:0x9aa4b2},
    {id:'h_input',  file:'models/harmonic_htm/InputShaft.STL',     axis:'y', yBase:39,  yExp:52,  color:0x8a94a4},
    {id:'h_coupler',file:'models/harmonic_htm/Coupler.STL',        axis:'y', yBase:49,  yExp:62,  color:0xc8cfd9},
    {id:'h_motor',  file:'models/harmonic_htm/MotorMount.STL',     axis:'y', yBase:61,  yExp:74,  color:0x9aa4b2}
  ];
  buildTdCoaxial(parts,done);
}

/* ===== 行星减速器：CyberGear 单级行星齿轮箱（真实开源 SolidWorks 模型） =====
   全部零件来自同一开源装配体（AGIRobots/PlanetarGear-3.5xReducer，专为小米 CyberGear
   人形机器人关节电机设计），保持真实比例，取代旧版"不同来源混搭+独立缩放"造成的重合错乱。 */

/* ---- 行星减速器可调参数 CYBER_ORBIT 已移至 js/config.js（E4 拆分） ---- */

/* ===== 谐波/摆线减速器：howtomechatronics 开源 SolidWorks 真实模型（同轴装配） =====
   全部零件来自 howtomechatronics.com 的 R25 减速器教程（25:1，外壳直径 95mm），
   谐波=刚轮52齿+柔轮50齿，摆线=26针齿+摆线盘，同属同一 SolidWorks 装配体、单位一致(mm)。
   本套函数把"厚度轴各异的 STL"统一旋转对齐到 Y 轴，再按真实比例同轴装配+沿 Y 爆炸，
   取代旧版"独立缩放+假堆叠"造成的重合错乱。 */

/* ---- 同轴装配可调参数 TD_LBL_X 已移至 js/config.js（E4 拆分） ---- */

/* 加载单个 STL 并把"厚度轴"旋转对齐到 Y 轴（不缩放，保持真实 mm 比例）
   axis：原始 STL 中厚度/旋转轴所在的轴（'x'/'y'/'z'）。例如圆盘厚度在 X 轴则传 'x'。
   为什么需要：SolidWorks 各零件导出 STL 时坐标系取向不一致，需逐个转正才能同轴装配。 */
function tdLoadAxis(url,axis,cb,color){
  if(!STLLoader){cb(null);return;}
  stlGeoSmart(url).then(function(geo){   /* 优先 .gz 压缩版，失败自动回退原始 STL */
    try{
      centerGeo(geo);                              /* 包围盒中心平移到原点 */
      var msh=new THREE.Mesh(geo,tdMat(color||0xc8cfd9));
      if(axis==='x')msh.rotation.z=-Math.PI/2;     /* 厚度 X→Y：绕 Z 轴转 -90° */
      else if(axis==='z')msh.rotation.x=Math.PI/2; /* 厚度 Z→Y：绕 X 轴转 +90° */
      /* axis==='y' 无需旋转 */
      msh.castShadow=true;msh.receiveShadow=true;
      cb(msh);
    }catch(e){cb(null);}
  }).catch(function(){cb(null);});   /* 压缩版与原始版都失败：交回退零件 */
}

/* 同轴装配通用构建器：加载真实 STL → 厚度轴转正 → 同轴/轴向装配 → 沿 Y 轴爆炸
   每个零件需提供：file(路径)、axis(厚度轴)、yBase(装配态中心Y)、yExp(爆炸态中心Y)、color(颜色)。
   可选 orbit/count：需绕 Y 轴均布多份的零件（如行星轮×6）。
   同心零件(刚轮/柔轮/波发生器)在 yBase 处嵌套(半径不同、Y 重叠)，爆炸时沿 Y 分离到 yExp。 */
function buildTdCoaxial(parts,done){
  var items=[];
  var pending=parts.length;
  parts.forEach(function(p){
    var g=new THREE.Group();
    var partName=(TD_INFO[p.id]&&TD_INFO[p.id].n)?TD_INFO[p.id].n:p.id;
    var label=createPartLabel(partName,new THREE.Vector3(0,0,0));
    if(label){label.position.set(TD_LBL_X,0,0);label.userData.tdLabelFor=p.id;g.add(label);}
    items.push({obj:g,id:p.id,yBase:p.yBase,yExp:p.yExp});
    /* 异步加载真实 STL；失败则留空(场景其余零件仍可用) */
    (function(pid,pobj){
      tdLoadAxis(pobj.file,pobj.axis,function(msh){
        if(msh){
          msh.userData.tdId=pid;
          if(pobj.orbit&&pobj.count){
            /* 均布零件（行星轮）：count 个绕 Y 轴均布，公转半径 orbit(真实 mm) */
            var grp=new THREE.Group();
            for(var i=0;i<pobj.count;i++){
              var a=i*Math.PI*2/pobj.count;
              var cl=msh.clone();
              cl.position.set(Math.cos(a)*pobj.orbit,0,Math.sin(a)*pobj.orbit);
              grp.add(cl);
            }
            g.add(grp);
          }else{
            g.add(msh);
          }
        }
        if(--pending===0)finish();
      },pobj.color);
    })(p.id,p);
  });
  function finish(){
    /* 装配态：同心零件在各自 yBase 嵌套，轴向零件沿 Y 堆叠 */
    items.forEach(function(it){it.obj.position.set(0,it.yBase,0);});
    /* 爆炸态：每个零件沿 Y 分离到 yExp，方向由 yExp 相对 yBase 的符号决定 */
    items.forEach(function(it){
      var dy=it.yExp-it.yBase;
      var dir=new THREE.Vector3(0,Math.sign(dy)||1,0);
      addTdPart(it.obj,it.id,dir,Math.abs(dy));
    });
    done();
  }
}

/* 场景3：CyberGear 单级行星减速器（8 个零件全部为来自同一装配体的真实开源 STL） */
function buildTdPlanetary(done){
  var parts=[
    {id:'p_output', file:'models/planetary_cybergear/OutputShaft.stl',     yBase:-18, yExp:-36, color:0xc8cfd9},
    {id:'p_back',   file:'models/planetary_cybergear/Back.stl',            yBase:-10, yExp:-26, color:0x9aa4b2},
    {id:'p_carrier',file:'models/planetary_cybergear/CareerReception.stl', yBase:-3,  yExp:-12, color:0x9aa4b2},
    /* 齿轮组：太阳轮/行星轮/内齿圈同心共面(同一 Y 高度啮合)，不再沿轴堆叠，装配更紧凑 */
    {id:'p_ring',   file:'models/planetary_cybergear/RingGear.stl',        yBase:0,   yExp:16,  color:0x8a94a4},
    {id:'p_planet', file:'models/planetary_cybergear/PlanetGear.stl',      yBase:0,   yExp:-4,  color:0xb8c0cc, orbit:CYBER_ORBIT, count:6},
    {id:'p_sun',    file:'models/planetary_cybergear/SunGear.stl',         yBase:0,   yExp:8,   color:0xffd479},
    {id:'p_front',  file:'models/planetary_cybergear/Front.stl',           yBase:10,  yExp:26,  color:0x9aa4b2},
    {id:'p_input',  file:'models/planetary_cybergear/InputShaft.stl',      yBase:18,  yExp:36,  color:0x8a94a4}
  ];
  var items=[];
  var pending=parts.length;
  parts.forEach(function(p){
    var g=new THREE.Group();
    var partName=(TD_INFO[p.id]&&TD_INFO[p.id].n)?TD_INFO[p.id].n:p.id;
    var label=createPartLabel(partName,new THREE.Vector3(0,0,0));
    if(label){label.position.set(TD_LBL_X,0,0);label.userData.tdLabelFor=p.id;g.add(label);}
    items.push({obj:g,id:p.id,yBase:p.yBase,yExp:p.yExp});
    /* 异步加载真实 STL；行星零件厚度轴均为 Z，用 tdLoadAxis 转正到 Y，保持真实 mm 比例 */
    (function(pid,pobj){
      tdLoadAxis(pobj.file,'z',function(msh){
        if(msh){
          msh.userData.tdId=pid;
          if(pobj.orbit&&pobj.count){
            /* 行星轮：6 个绕 Y 轴均布，公转半径 CYBER_ORBIT(真实 mm) */
            var grp=new THREE.Group();
            for(var i=0;i<pobj.count;i++){
              var a=i*Math.PI*2/pobj.count;
              var cl=msh.clone();
              cl.position.set(Math.cos(a)*pobj.orbit,0,Math.sin(a)*pobj.orbit);
              grp.add(cl);
            }
            g.add(grp);
          }else{
            g.add(msh);
          }
        }
        if(--pending===0)finish();
      },pobj.color);
    })(p.id,p);
  });
  function finish(){
    /* 装配态：齿轮组同心共面在各自 yBase，前后盖/轴在两侧沿 Y 堆叠 */
    items.forEach(function(it){it.obj.position.set(0,it.yBase,0);});
    /* 爆炸态：纯轴向(沿 Y)上下分离，整齐不散乱 */
    items.forEach(function(it){
      var dy=it.yExp-it.yBase;
      var dir=new THREE.Vector3(0,Math.sign(dy)||1,0);
      addTdPart(it.obj,it.id,dir,Math.abs(dy));
    });
    done();
  }
}

/* 场景4：摆线 RV 减速器（10 个零件全部为 howtomechatronics 开源 SolidWorks 真实 STL）
   同轴装配：摆线盘/滚柱衬套环/基座外壳同心嵌套，偏心轴/输入轴/电机座沿轴堆叠，保持真实比例。 */
function buildTdCycloidal(done){
  var parts=[
    {id:'c_output', file:'models/cycloidal_htm/OutputShaft.STL',       axis:'y', yBase:-22, yExp:-40, color:0xc8cfd9},
    {id:'c_base',   file:'models/cycloidal_htm/BaseHousing.STL',       axis:'z', yBase:-8,  yExp:-26, color:0x9aa4b2},
    {id:'c_disk',   file:'models/cycloidal_htm/CycloidalDisk.STL',     axis:'z', yBase:-3,  yExp:-8,  color:0xffd479},
    {id:'c_rollers',file:'models/cycloidal_htm/RollerBushingRing.STL', axis:'y', yBase:2,   yExp:-2,  color:0x8a94a4},
    {id:'c_lid',    file:'models/cycloidal_htm/HousingLid.STL',        axis:'y', yBase:14,  yExp:16,  color:0x9aa4b2},
    {id:'c_ecc',    file:'models/cycloidal_htm/EccentricShaft.STL',    axis:'y', yBase:22,  yExp:28,  color:0xb8c0cc},
    {id:'c_input',  file:'models/cycloidal_htm/InputShaft.STL',        axis:'y', yBase:32,  yExp:40,  color:0x8a94a4},
    {id:'c_ring2',  file:'models/cycloidal_htm/DistanceRing2.STL',     axis:'y', yBase:40,  yExp:50,  color:0xc8cfd9},
    {id:'c_ring3',  file:'models/cycloidal_htm/DistanceRing3.STL',     axis:'y', yBase:44,  yExp:58,  color:0xc8cfd9},
    {id:'c_motor',  file:'models/cycloidal_htm/MotorMount.STL',        axis:'y', yBase:56,  yExp:72,  color:0x9aa4b2}
  ];
  buildTdCoaxial(parts,done);
}

/* 场景5：智元灵犀X1 PowerFlow 关节（QDD 准直驱：外转子无框电机+单级行星+双编码器）
   行星减速五件套复用 CyberGear 开源装配体真实 STL（同为 QDD 关节方案）；
   法兰/轴承/外转子/定子/双编码器/驱控板按 PF86 结构参数化重建。
   yBase=装配态中心Y；yExp=爆炸态中心Y；零件数组顺序 = 拆解顺序动画顺序（输出端→电机端）。 */
function buildTdPowerflow(done){
  var parts=[
    /* 拆解1：输出法兰（参数化：中空走线盘） */
    {id:'pf_flange', para:function(){return new THREE.Mesh(new THREE.CylinderGeometry(34,34,3.5,48),tdMat(0xd8dee8,0.7,0.3));}, yBase:-30, yExp:-52},
    /* 拆解2：行星输出轴（真实STL，厚度轴Y） */
    {id:'pf_output', file:'models/planetary_cybergear/OutputShaft.stl', axis:'y', color:0xc8cfd9, yBase:-20, yExp:-38},
    /* 拆解3：角接触轴承（参数化：大孔径环，中空走线让位） */
    {id:'pf_bearing', para:function(){return new THREE.Mesh(new THREE.TorusGeometry(30,3,16,48),tdMat(0xb8c0cc));}, yBase:-12, yExp:-26},
    /* 拆解4~7：行星减速组（真实STL，同心共面啮合；行星轮6个绕Y均布） */
    {id:'pf_planet', file:'models/planetary_cybergear/PlanetGear.stl', axis:'z', color:0xb8c0cc, orbit:CYBER_ORBIT, count:6, yBase:-2, yExp:-14},
    {id:'pf_carrier',file:'models/planetary_cybergear/CareerReception.stl', axis:'z', color:0x9aa4b2, yBase:-2, yExp:-8},
    {id:'pf_sun',    file:'models/planetary_cybergear/SunGear.stl', axis:'z', color:0xffd479, yBase:-2, yExp:4},
    {id:'pf_ring',   file:'models/planetary_cybergear/RingGear.stl', axis:'z', color:0x8a94a4, yBase:-2, yExp:12},
    /* 拆解8：外转子（参数化：大直径环形磁钢，QDD标志——又大又扁） */
    {id:'pf_rotor', para:function(){var m=new THREE.Mesh(new THREE.TorusGeometry(27,5,18,48),tdMat(0x3a404c));m.rotation.x=Math.PI/2;return m;}, yBase:9, yExp:26},
    /* 拆解9：定子（参数化：绕组铁芯在转子内侧，同心嵌套） */
    {id:'pf_stator', para:function(){return new THREE.Mesh(new THREE.CylinderGeometry(21,21,9,48),tdMat(0xb0763a,0.2,0.7));}, yBase:9, yExp:38},
    /* 拆解10~11：双编码器（参数化：输出端绝对值+电机端增量） */
    {id:'pf_enc_out', para:function(){return new THREE.Mesh(new THREE.CylinderGeometry(15,15,1.6,48),tdMat(0x2f6db3,0.4,0.5));}, yBase:15, yExp:48},
    {id:'pf_enc_mot', para:function(){return new THREE.Mesh(new THREE.CylinderGeometry(10,10,1.4,48),tdMat(0x2f6db3,0.4,0.5));}, yBase:19, yExp:58},
    /* 拆解12：PF-Link 驱控板（参数化：驱控一体电路板） */
    {id:'pf_pcb', para:function(){return new THREE.Mesh(new THREE.BoxGeometry(26,1.8,20),tdMat(0x2e7d4f,0.2,0.7));}, yBase:25, yExp:68}
  ];
  var items=[],pending=parts.length;
  parts.forEach(function(p){
    var g=new THREE.Group();
    var partName=(TD_INFO[p.id]&&TD_INFO[p.id].n)?TD_INFO[p.id].n:p.id;
    var label=createPartLabel(partName,new THREE.Vector3(0,0,0));
    if(label){label.position.set(TD_LBL_X,0,0);label.userData.tdLabelFor=p.id;g.add(label);}
    items.push({obj:g,id:p.id,yBase:p.yBase,yExp:p.yExp});
    if(p.para){
      /* 参数化零件：立即创建（真实STL失败时的回退也是它，这里直接做主体） */
      var m=p.para();
      m.castShadow=true;m.receiveShadow=true;
      m.userData.tdId=p.id;
      g.add(m);
      if(--pending===0)finish();
    }else{
      /* 真实 STL：异步加载并转正厚度轴；失败则该零件只有标签（场景仍可用） */
      tdLoadAxis(p.file,p.axis,function(msh){
        if(msh){
          msh.userData.tdId=p.id;
          if(p.orbit&&p.count){
            /* 行星轮×6 绕 Y 轴均布，公转半径 CYBER_ORBIT(真实 mm) */
            var grp=new THREE.Group();
            for(var i=0;i<p.count;i++){
              var a=i*Math.PI*2/p.count;
              var cl=msh.clone();
              cl.position.set(Math.cos(a)*p.orbit,0,Math.sin(a)*p.orbit);
              grp.add(cl);
            }
            g.add(grp);
          }else{
            g.add(msh);
          }
        }
        if(--pending===0)finish();
      },p.color);
    }
  });
  function finish(){
    /* 装配态：行星组同心共面在 yBase，电机/编码器沿 Y 堆叠，转子/定子同心嵌套 */
    items.forEach(function(it){it.obj.position.set(0,it.yBase,0);});
    /* 爆炸态：纯轴向(沿 Y)上下分离，方向由 yExp 相对 yBase 的符号决定 */
    items.forEach(function(it){
      var dy=it.yExp-it.yBase;
      var dir=new THREE.Vector3(0,Math.sign(dy)||1,0);
      addTdPart(it.obj,it.id,dir,Math.abs(dy));
    });
    done();
  }
}

/* 拆解场景归一化：整体缩放到合适大小并居中到相机焦点 (0,-15,0) */
function normalizeTd(){
  if(!tdGroup)return;
  tdGroup.scale.set(1,1,1);
  tdGroup.position.set(0,0,0);
  tdGroup.rotation.set(0,0,0);
  var b=new THREE.Box3().setFromObject(tdGroup);
  var maxd=Math.max(b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z,0.001);
  var s=52/maxd;
  tdGroup.scale.set(s,s,s);
  var b2=new THREE.Box3().setFromObject(tdGroup);
  var c2=b2.getCenter(new THREE.Vector3());
  tdGroup.position.set(-c2.x,-15-c2.y,-c2.z);
  /* 相机取景：拉近并放宽缩放范围，方便观察小零件（只在首次进入拆解场景时保存原值） */
  if(!tdCamSaved){
    savedCam.min=controls.minDistance;savedCam.max=controls.maxDistance;
    tdCamSaved=true;
  }
  controls.minDistance=25;controls.maxDistance=260;
  controls.target.set(0,-15,0);
  camera.position.set(0,-2,95);
}

/* 清理拆解场景（释放显存），可重复调用无副作用 */
function cleanupTdGroup(){
  tdAutoOn=false;tdSpinOn=false;tdSelId=null;
  tdSeqOn=false;tdSeqT=0;   /* 顺序拆解动画复位 */
  if(tdGroup){
    tdGroup.traverse(function(o){
      if(o.isMesh){
        if(o.geometry)o.geometry.dispose();
        if(o.material)o.material.dispose();
      }
    });
    scene.remove(tdGroup);
  }
  tdGroup=null;tdParts=[];tdExplodeT=0;
}

/* 构建并进入拆解场景（由主脚本 selectPart 调用） */
function buildTdScene(key,sceneName){
  if(tdActive&&tdKey===key&&tdGroup)return;  /* 同一场景重复进入直接返回 */
  cleanupTdGroup();
  tdKey=key;tdActive=true;
  /* 对比模式与拆解场景互斥（舞台只能给一方）：进入拆解前先退出对比并复位按钮 */
  if(compareMode){
    compareMode=false;
    var bc=document.getElementById('bbCompare');if(bc)bc.classList.remove('on');
    exitCompareLayout();   /* 恢复单机型布局，body3d 随后由拆解场景隐藏 */
  }
  tdGroup=new THREE.Group();
  scene.add(tdGroup);
  body3d.visible=false;                       /* 隐藏机器人，舞台让给拆解场景 */
  var bbTd=document.getElementById('bottomBar');if(bbTd)bbTd.classList.add('td-on');  /* 显示拆解专属按钮 */
  document.body.classList.add('td-on');  /* 移动端抽屉联动:显示拆解专属按钮/隐藏整机专属 */
  var bar=document.getElementById('exbar');if(bar)bar.classList.add('show');
  var rg=document.getElementById('exrng');if(rg)rg.value=0;
  var ea=document.getElementById('exauto');if(ea)ea.classList.remove('on');
  var es=document.getElementById('exspin');if(es)es.classList.remove('on');
  var bs=document.getElementById('bbSeq');if(bs)bs.classList.remove('on');  /* 顺序拆解按钮复位 */
  showLdtip('正在构建拆解场景（加载开源零件模型）…');
  var done=function(){normalizeTd();hideLdtip();};
  if(sceneName==='joint')buildTdJoint(done);
  else if(sceneName==='powerflow')buildTdPowerflow(done);
  else if(sceneName==='harmonic')buildTdHarmonic(done);
  else if(sceneName==='planetary')buildTdPlanetary(done);
  else if(sceneName==='cycloidal')buildTdCycloidal(done);
  else done();
}

/* 进入拆解场景入口（挂到 window 供主脚本调用）：先确保 3D 引擎已启用 */
window.enterTdScene=function(key){
  var d=(window.RobotApp&&window.RobotApp.DATA)?window.RobotApp.DATA[key]:null;
  if(!d||!d.scene)return;
  if(!window.Robot3D)return;
  window.Robot3D.enable(function(ok){
    if(!ok){showLdtip('3D 引擎加载失败，拆解场景不可用（请检查网络后刷新重试）');return;}
    buildTdScene(key,d.scene);
  });
};

/* 退出拆解场景入口（挂到 window）：恢复机器人视图，可重复调用无副作用 */
window.exitTdScene=function(){
  if(!tdActive&&!tdGroup)return;
  tdActive=false;tdKey='';
  var bbTdX=document.getElementById('bottomBar');if(bbTdX)bbTdX.classList.remove('td-on');  /* 收起拆解专属按钮 */
  document.body.classList.remove('td-on');  /* 移动端抽屉联动:恢复整机按钮 */
  var bar=document.getElementById('exbar');if(bar)bar.classList.remove('show');
  cleanupTdGroup();
  hideLdtip();
  if(body3d)body3d.visible=true;
  if(built){
    /* 恢复相机：优先回到整机适配时保存的初始视角（官方模型加载完成时由fitCameraToObject保存） */
    if(cameraInitTarget&&cameraInitPosition){
      controls.target.copy(cameraInitTarget);
      camera.position.copy(cameraInitPosition);
      controls.minDistance=cameraInitMinDist;
      controls.maxDistance=cameraInitMaxDist;
    }else{
      controls.minDistance=savedCam.min;controls.maxDistance=savedCam.max;
      controls.target.set(0,-15,0);
      camera.position.set(0,-15,105);
    }
  }
  tdCamSaved=false;  /* 复位标记：下次进入拆解场景重新保存相机限制 */
};

/* 点击拆解零件：高亮该零件、暗化其余，并在右侧详情顶部插入零件详解卡片 */
function onTdPartClick(id){
  tdSelId=id;
  tdParts.forEach(function(p){
    var sel=(p.id===id);
    p.obj.traverse(function(o){
      if(!o.isMesh)return;
      /* 【优化】选中零件不透明+高亮发光；未选中更透明(0.35)弱化，避免遮挡干扰 */
      o.material.emissive.setHex(sel?accentHex:0x000000);
      o.material.emissiveIntensity=sel?0.5:0;
      o.material.opacity=sel?1:0.35;
      o.material.transparent=!sel;
    });
  });
  showTdCard(id);
}

/* 在右侧详情面板顶部插入零件详解卡片（带关闭按钮） */
function showTdCard(id){
  var info=TD_INFO[id];
  var dIn=document.getElementById('dIn');
  if(!info||!dIn)return;
  var old=document.getElementById('tdCard');if(old)old.remove();
  var card=document.createElement('div');
  card.id='tdCard';
  card.className='tip';
  card.innerHTML='<b>🔩 '+info.n+'</b><span id="tdCardX" style="float:right;cursor:pointer;color:var(--muted)">✕ 关闭</span><div style="margin-top:6px;font-weight:400">'+info.p+'</div>';
  dIn.insertBefore(card,dIn.firstChild);
  var x=document.getElementById('tdCardX');
  if(x)x.addEventListener('click',function(){card.remove();});
  dIn.scrollTop=0;
}

/* ===== 爆炸滑杆 / 自动拆解 / 旋转 按钮事件（仅拆解场景激活时生效） ===== */
var exrngEl=document.getElementById('exrng');
if(exrngEl)exrngEl.addEventListener('input',function(){
  if(!tdActive)return;
  tdAutoOn=false;
  tdSeqOn=false;   /* 手动拖滑杆时退出顺序拆解动画 */
  var bsq=document.getElementById('bbSeq');if(bsq)bsq.classList.remove('on');
  var ea=document.getElementById('exauto');if(ea)ea.classList.remove('on');
  applyTdExplode(exrngEl.value/100);
});
var exautoEl=document.getElementById('exauto');
if(exautoEl)exautoEl.addEventListener('click',function(){
  if(!tdActive)return;
  tdAutoOn=!tdAutoOn;
  exautoEl.classList.toggle('on',tdAutoOn);
  if(tdAutoOn){
    tdAutoDir=1;
    tdSeqOn=false;   /* 与顺序拆解互斥 */
    var bsq=document.getElementById('bbSeq');if(bsq)bsq.classList.remove('on');
  }
});
var exspinEl=document.getElementById('exspin');
if(exspinEl)exspinEl.addEventListener('click',function(){
  if(!tdActive)return;
  tdSpinOn=!tdSpinOn;
  exspinEl.classList.toggle('on',tdSpinOn);
});

/* ==================== ADRC 页面：PI vs ADRC 交互仿真 ==================== */
window.hookAdrcSim=function(){
  var cv=document.getElementById('adrcCv');
  if(!cv||!cv.getContext)return;
  var ctx=cv.getContext('2d');
  var btn=document.getElementById('adrcRun');
  var rafId=null;

  /* 仿真参数（与页面 C 代码宏定义一致） */
  var DT=0.001,T_END=6.0,B=8.0;     /* 控制周期1ms；对象真实增益 b=8（与 b0 一致） */
  var DIST_T=3.0,DIST_A=6.0;        /* 3 秒处突加幅值 6 的外部扰动（模拟碰撞/负载突变） */
  var R=1.0,R_T=0.2;                /* 0.2 秒施加幅值 1 的位置阶跃指令 */

  /* 被控对象：ÿ = -0.5·ẏ + w(t) + b·u（阻尼项对 PI 未知，ADRC 将其视为总扰动估计补偿） */
  function plantStep(st,u,t){
    var w=(t>=DIST_T)?DIST_A:0;
    var acc=-0.5*st.v+w+B*u;
    st.v+=acc*DT;st.y+=st.v*DT;
  }
  /* 位置环 PI 控制器（带积分限幅） */
  function makePI(){
    var integ=0,kp=25,ki=60;
    return function(r,y){
      var e=r-y;
      integ+=e*DT;
      var u=kp*e+ki*integ;
      if(u>20)u=20;if(u<-20)u=-20;
      return u;
    };
  }
  /* 位置环 ADRC（线性 ESO 带宽参数化，与页面 C 代码同源） */
  function makeADRC(){
    var b0=8,wc=60,wo=240;
    var kp=wc*wc,kd=2*wc;
    var b1=3*wo,b2=3*wo*wo,b3=wo*wo*wo;
    var z1=0,z2=0,z3=0,uPrev=0;
    return function(r,y){
      var e=z1-y;                    /* 输出误差 */
      z1+=DT*(z2-b1*e);              /* ESO: 位置估计 */
      z2+=DT*(z3-b2*e+b0*uPrev);     /* ESO: 速度估计 */
      z3+=DT*(-b3*e);                /* ESO: 总扰动估计 */
      var u0=kp*(r-z1)+kd*(0-z2);    /* PD 状态误差反馈 */
      var u=u0-z3/b0;                /* 扰动补偿——ADRC 的灵魂 */
      if(u>20)u=20;if(u<-20)u=-20;
      uPrev=u;
      return u;
    };
  }
  /* 跑一遍完整仿真，每 6 步（100Hz）采样一次 */
  function simulate(){
    var pi=makePI(),adrc=makeADRC();
    var stP={y:0,v:0},stA={y:0,v:0};
    var out={t:[],r:[],yp:[],ya:[]};
    var n=Math.round(T_END/DT);
    for(var k=0;k<n;k++){
      var t=k*DT;
      var r=(t>=R_T)?R:0;
      var up=pi(r,stP.y),ua=adrc(r,stA.y);
      plantStep(stP,up,t);
      plantStep(stA,ua,t);
      if(k%6===0){out.t.push(t);out.r.push(r);out.yp.push(stP.y);out.ya.push(stA.y);}
    }
    return out;
  }
  var data=simulate();

  /* 绘制曲线（prog: 0~1 渐进绘制进度） */
  function draw(prog){
    var W=cv.width,H=cv.height,padL=34,padR=10,padT=12,padB=22;
    var yMin=-0.15,yMax=1.45;
    function X(t){return padL+(W-padL-padR)*t/T_END;}
    function Y(v){return H-padB-(H-padT-padB)*(v-yMin)/(yMax-yMin);}
    ctx.clearRect(0,0,W,H);
    /* 网格与坐标轴 */
    ctx.strokeStyle='rgba(138,148,164,.22)';ctx.lineWidth=1;
    ctx.font='9px sans-serif';ctx.fillStyle='#8a94a4';
    for(var gv=0;gv<=1.41;gv+=0.2){ctx.beginPath();ctx.moveTo(padL,Y(gv));ctx.lineTo(W-padR,Y(gv));ctx.stroke();ctx.fillText(gv.toFixed(1),6,Y(gv)+3);}
    for(var gt=0;gt<=6;gt++){ctx.beginPath();ctx.moveTo(X(gt),padT);ctx.lineTo(X(gt),H-padB);ctx.stroke();ctx.fillText(gt+'s',X(gt)-6,H-8);}
    /* 扰动施加标记线 */
    ctx.strokeStyle='rgba(240,80,80,.55)';ctx.setLineDash([4,3]);
    ctx.beginPath();ctx.moveTo(X(DIST_T),padT);ctx.lineTo(X(DIST_T),H-padB);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='rgba(240,80,80,.9)';ctx.fillText('扰动施加',X(DIST_T)+4,padT+8);
    var N=Math.max(2,Math.floor(data.t.length*prog));
    function line(arr,color,w,dash){
      ctx.strokeStyle=color;ctx.lineWidth=w;ctx.setLineDash(dash||[]);
      ctx.beginPath();
      for(var i=0;i<N;i++){
        var x=X(data.t[i]),y=Y(arr[i]);
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.stroke();ctx.setLineDash([]);
    }
    line(data.r,'#8a94a4',1.2,[5,4]);  /* 目标指令（灰色虚线） */
    line(data.yp,'#2b8eff',1.8);       /* PI 响应（蓝） */
    line(data.ya,'#f0a73a',1.8);       /* ADRC 响应（橙） */
  }
  /* 重新演示：渐进绘制 2.2 秒 */
  function run(){
    if(rafId)cancelAnimationFrame(rafId);
    data=simulate();
    var t0=performance.now(),DUR=2200;
    function step(now){
      var p=Math.min(1,(now-t0)/DUR);
      draw(p);
      if(p<1)rafId=requestAnimationFrame(step);else rafId=null;
    }
    rafId=requestAnimationFrame(step);
  }
  if(btn)btn.addEventListener('click',run);
  run();
};

/* ==================== 力控仿真页面：位置控制 vs 阻抗控制（碰撞墙壁对比） ====================
   场景：关节收到越过墙壁的目标指令，对比高刚度位置控制与低刚度阻抗控制的
   接触力表现——演示人形机器人为什么需要力控/柔顺控制模式。 */
window.hookForceSim=function(){
  var cv=document.getElementById('fcCv');
  if(!cv||!cv.getContext)return;
  var ctx=cv.getContext('2d');
  var btn=document.getElementById('fcRun');
  var rafId=null;

  /* 仿真可调参数（调试用宏，归一化单关节模型 J=1） */
  var DT=0.001,T_END=4.0;      /* 控制周期1ms；总仿真时长4s */
  var R_T=0.3,R_DES=0.9;       /* 0.3s 施加阶跃指令 0.9rad（越过墙壁） */
  var Q_WALL=0.55;             /* 墙壁位置(rad)：控制器"不知道"的刚性环境 */
  var K_ENV=4000,B_ENV=8;      /* 环境刚度/阻尼（接触弹簧-阻尼模型） */
  var KP_POS=400,KD_POS=25;    /* 位置控制：高刚度PD（自由空间跟踪快而准） */
  var KP_IMP=40,KD_IMP=8;      /* 阻抗控制：低刚度PD（柔顺安全） */
  var TAU_MAX=400;             /* 关节扭矩限幅（两种控制相同） */
  var F_MAX=500;               /* 接触力绘图上限（超出截断显示） */

  /* 单关节被控对象：q'' = τ − b·q' − F_env，返回接触环境反作用力 */
  function plantStep(st,tau){
    var fe=0;
    if(st.q>Q_WALL)fe=K_ENV*(st.q-Q_WALL)+B_ENV*st.v;  /* 接触弹簧-阻尼 */
    if(fe<0)fe=0;                                       /* 墙壁只压不拉（非粘性接触） */
    var acc=tau-0.8*st.v-fe;                            /* 关节自身粘滞阻尼0.8 */
    st.v+=acc*DT;st.q+=st.v*DT;
    return fe;
  }
  /* PD 控制律：位置控制与阻抗控制共用同一结构，区别只在刚度/阻尼参数 */
  function makePD(kp,kd){
    return function(r,q,v){
      var u=kp*(r-q)+kd*(0-v);
      if(u>TAU_MAX)u=TAU_MAX;if(u<-TAU_MAX)u=-TAU_MAX;  /* 扭矩限幅 */
      return u;
    };
  }
  /* 跑一遍完整仿真（两个控制器各驱动一份相同对象），每 6 步(约100Hz)采样一次 */
  function simulate(){
    var posC=makePD(KP_POS,KD_POS),impC=makePD(KP_IMP,KD_IMP);
    var stP={q:0,v:0},stI={q:0,v:0};                    /* 两份独立对象状态 */
    var out={t:[],r:[],qp:[],qi:[],fp:[],fi:[]};
    var n=Math.round(T_END/DT);
    for(var k=0;k<n;k++){
      var t=k*DT;
      var r=(t>=R_T)?R_DES:0;
      var fp=plantStep(stP,posC(r,stP.q,stP.v));        /* 位置控制：返回接触力 */
      var fi=plantStep(stI,impC(r,stI.q,stI.v));        /* 阻抗控制：返回接触力 */
      if(k%6===0){
        out.t.push(t);out.r.push(r);
        out.qp.push(stP.q);out.qi.push(stI.q);
        out.fp.push(fp);out.fi.push(fi);
      }
    }
    return out;
  }
  var data=simulate();

  /* 绘制曲线（prog: 0~1 渐进绘制进度）：上窗格=关节角度，下窗格=接触力 */
  function draw(prog){
    var W=cv.width,H=cv.height,padL=34,padR=10,padT=12,padB=22;
    var hTop=150,hBot0=178,hBot1=H-padB;                 /* 上/下窗格边界 */
    var qMin=-0.05,qMax=1.05;                            /* 角度窗格值域 */
    function X(t){return padL+(W-padL-padR)*t/T_END;}
    function YQ(v){return hTop-(hTop-padT)*(v-qMin)/(qMax-qMin);}
    function YF(v){return hBot1-(hBot1-hBot0)*Math.min(v,F_MAX)/F_MAX;}
    ctx.clearRect(0,0,W,H);
    /* 网格与坐标轴 */
    ctx.strokeStyle='rgba(138,148,164,.22)';ctx.lineWidth=1;
    ctx.font='9px sans-serif';ctx.fillStyle='#8a94a4';
    for(var gv=0;gv<=1.01;gv+=0.25){ctx.beginPath();ctx.moveTo(padL,YQ(gv));ctx.lineTo(W-padR,YQ(gv));ctx.stroke();ctx.fillText(gv.toFixed(2),6,YQ(gv)+3);}
    for(var gf=0;gf<=F_MAX+1;gf+=100){ctx.beginPath();ctx.moveTo(padL,YF(gf));ctx.lineTo(W-padR,YF(gf));ctx.stroke();ctx.fillText(gf,padL+2,YF(gf)-2);}
    for(var gt=0;gt<=4;gt++){ctx.beginPath();ctx.moveTo(X(gt),padT);ctx.lineTo(X(gt),hBot1);ctx.stroke();ctx.fillText(gt+'s',X(gt)-6,H-8);}
    /* 墙壁位置标记线（红色虚线，仅角度窗格） */
    ctx.strokeStyle='rgba(240,80,80,.7)';ctx.setLineDash([4,3]);
    ctx.beginPath();ctx.moveTo(X(0),YQ(Q_WALL));ctx.lineTo(W-padR,YQ(Q_WALL));ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='rgba(240,80,80,.95)';ctx.fillText('墙壁 0.55rad',X(0)+6,YQ(Q_WALL)-4);
    /* 窗格标题 */
    ctx.fillStyle='#8a94a4';ctx.fillText('关节角度 (rad)',padL+4,padT+10);
    ctx.fillText('接触力 (归一化)',padL+4,hBot0+10);
    var N=Math.max(2,Math.floor(data.t.length*prog));
    function line(mapY,arr,color,w,dash){
      ctx.strokeStyle=color;ctx.lineWidth=w;ctx.setLineDash(dash||[]);
      ctx.beginPath();
      for(var i=0;i<N;i++){
        var x=X(data.t[i]),y=mapY(arr[i]);
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.stroke();ctx.setLineDash([]);
    }
    /* 上窗格：目标指令 + 两种控制的关节轨迹 */
    line(YQ,data.r,'#8a94a4',1.2,[5,4]);  /* 目标指令（灰虚线） */
    line(YQ,data.qp,'#2b8eff',1.8);       /* 位置控制轨迹（蓝） */
    line(YQ,data.qi,'#f0a73a',1.8);       /* 阻抗控制轨迹（橙） */
    /* 下窗格：两种控制的接触力 */
    line(YF,data.fp,'#2b8eff',1.8);       /* 位置控制接触力（蓝） */
    line(YF,data.fi,'#f0a73a',1.8);       /* 阻抗控制接触力（橙） */
  }
  /* 重新演示：渐进绘制 2.2 秒 */
  function run(){
    if(rafId)cancelAnimationFrame(rafId);
    data=simulate();
    var t0=performance.now(),DUR=2200;
    function step(now){
      var p=Math.min(1,(now-t0)/DUR);
      draw(p);
      if(p<1)rafId=requestAnimationFrame(step);else rafId=null;
    }
    rafId=requestAnimationFrame(step);
  }
  if(btn)btn.addEventListener('click',run);
  run();
};

window.Robot3D={
  get built(){return built;}, get active(){return active;},
  enable:function(cb){
    if(built){active=true;resume();onResize();if(cb)cb(true);return;}
    loadDeps(function(ok){
      if(!ok){hideLoading();if(cb)cb(false);return;}
      try{ initThree(); }catch(e){ console.warn('[Robot3D] 初始化失败:',e); hideLoading(); if(cb)cb(false); return; }
      active=true;
      resume();
      if(cb)cb(true);
    });
  },
  disable:function(){active=false;pause();},
  pause:pause, resume:resume, onResize:onResize,
  highlight:highlight, focusOn:focusOn, setModel:setModel, applyTheme:applyTheme,
  highlightLink:highlightLink,
  /* 视角与模式控制 */
  resetView:resetView,
  setWireframe:setWireframe,
  setAutoRotate:setAutoRotate,
  zoom:zoomCamera3D,
  dolly:zoomCamera3D,   /* 别名：兼容旧代码调用 */
  orbit:orbit3D,        /* 键盘旋转 */
  createPartLabel:createPartLabel,
  /* 3D关节控制 */
  toggleAnimDemo:toggleAnimDemo,
  resetJoints:resetAllJoints,
  poseWaveHand:poseWaveHand,
  poseTpose:poseTpose,
  poseSquat:poseSquat,
  setJointAngle:setJointAngle,
  toggleCompare:toggleCompare,   /* H1/G1 同屏对比开关（供底部栏按钮调用） */
  setColorScheme:applyColorScheme, /* 机身配色方案切换（供底部栏/移动端抽屉下拉调用） */
  setEnvPreset:applyEnvPreset,     /* 环境背景预设切换（供底部栏/移动端抽屉下拉调用） */
  setFineMode:function(on){        /* 模型精细度切换：流畅(压缩) ↔ 精细(原始STL)，切换后重载 */
    try{localStorage.setItem('robot-fine-mode', on?'1':'0');}catch(e){}
    showLdtip(on?'正在加载原始精细模型(数据量大,请稍候)…':'正在切换流畅模式(压缩模型)…');
    setTimeout(function(){try{location.reload();}catch(e){}},300);
  },
  /* 零件数量统计（供底部栏性能显示使用） */
  get meshCount(){return body3d?countMeshes(body3d):0;},
  /* 拆解场景零件数量（供底部栏性能显示使用） */
  get tdMeshCount(){return tdGroup?countMeshes(tdGroup):0;},
  /* 当前机型部件分组（供 RobotApp.updateNav3d 读取，导航"无3D"标注的数据源） */
  get partGroups(){return partGroups;},
  /* ===== 拆解场景控制（供底部栏按钮调用，内部变量在Robot3D作用域内） ===== */
  isTdActive:function(){return tdActive;},
  /* 爆炸拆解：单向爆炸/装配动画 */
  toggleExplode:function(){
    if(!tdActive)return false;
    var exauto=document.getElementById('exauto');if(exauto)exauto.classList.remove('on');
    tdSeqOn=false;   /* 与顺序拆解互斥 */
    var bsq=document.getElementById('bbSeq');if(bsq)bsq.classList.remove('on');
    tdAutoOn=true;
    tdExplodeTarget=(tdExplodeT<0.5)?1:0;  /* 当前未爆炸则拆开，已爆炸则装配 */
    return tdExplodeTarget===1;
  },
  /* 零件标签开关：返回切换后的可见状态 */
  toggleLabels:function(){
    labelsVisible=!labelsVisible;
    if(tdGroup){
      tdGroup.traverse(function(o){
        if(o.userData&&o.userData.isLabel){o.visible=labelsVisible;}
      });
    }
    return labelsVisible;
  },
  /* 自动演示：自动循环拆解/装配动画 */
  toggleDemo:function(){
    if(!tdActive)return false;
    tdAutoOn=!tdAutoOn;
    tdExplodeTarget=null;                  /* 清除单向目标，进入往返模式 */
    var exauto=document.getElementById('exauto');if(exauto)exauto.classList.toggle('on',tdAutoOn);
    if(tdAutoOn){
      tdAutoDir=1;
      tdSeqOn=false;                       /* 与顺序拆解互斥 */
      var bsq=document.getElementById('bbSeq');if(bsq)bsq.classList.remove('on');
    }
    return tdAutoOn;
  },
  /* 顺序拆解动画：按真实拆解顺序逐个零件依次拆出→停顿→逆序装回，循环播放 */
  toggleSeq:function(){
    if(!tdActive)return false;
    tdSeqOn=!tdSeqOn;
    if(tdSeqOn){
      tdSeqT=0;                            /* 从装配态开始新一轮 */
      tdAutoOn=false;                      /* 与自动拆解/爆炸互斥 */
      tdExplodeTarget=null;
      var exauto=document.getElementById('exauto');if(exauto)exauto.classList.remove('on');
      var bbx=document.getElementById('bbExplode');if(bbx)bbx.classList.remove('on');
    }else{
      applyTdExplode(0);                   /* 关闭时归位到装配态 */
      var rg2=document.getElementById('exrng');if(rg2)rg2.value=0;
    }
    return tdSeqOn;
  }
};
