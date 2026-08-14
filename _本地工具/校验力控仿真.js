/* 校验力控仿真数学逻辑：与主页面 hookForceSim 同源的独立复现
   成功标准：
   1) 全程无 NaN/发散（位置/速度/力均有界）
   2) 位置控制稳态接触力 ≈ KP_POS×(R_DES−Q_WALL)（140±15%）
   3) 阻抗控制稳态接触力 < 位置控制的 1/5（演示"柔顺"效果）
   4) 位置控制接触力尖峰 > 阻抗控制尖峰（碰撞冲击对比成立）
   5) 撞墙前自由空间阶段：位置控制比阻抗控制先到达 0.5 rad（跟踪快） */
var DT=0.001,T_END=4.0;
var R_T=0.3,R_DES=0.9,Q_WALL=0.55;
var K_ENV=4000,B_ENV=8;
var KP_POS=400,KD_POS=25,KP_IMP=40,KD_IMP=8,TAU_MAX=400;

function plantStep(st,tau){
  var fe=0;
  if(st.q>Q_WALL)fe=K_ENV*(st.q-Q_WALL)+B_ENV*st.v;
  if(fe<0)fe=0;
  var acc=tau-0.8*st.v-fe;
  st.v+=acc*DT;st.q+=st.v*DT;
  return fe;
}
function makePD(kp,kd){
  return function(r,q,v){
    var u=kp*(r-q)+kd*(0-v);
    if(u>TAU_MAX)u=TAU_MAX;if(u<-TAU_MAX)u=-TAU_MAX;
    return u;
  };
}
var posC=makePD(KP_POS,KD_POS),impC=makePD(KP_IMP,KD_IMP);
var stP={q:0,v:0},stI={q:0,v:0};
var tPos05=-1,tImp05=-1,pkP=0,pkI=0;
var n=Math.round(T_END/DT);
for(var k=0;k<n;k++){
  var t=k*DT;
  var r=(t>=R_T)?R_DES:0;
  var fp=plantStep(stP,posC(r,stP.q,stP.v));
  var fi=plantStep(stI,impC(r,stI.q,stI.v));
  if(fp>pkP)pkP=fp;
  if(fi>pkI)pkI=fi;
  if(tPos05<0&&stP.q>=0.5)tPos05=t;
  if(tImp05<0&&stI.q>=0.5)tImp05=t;
  if(!isFinite(stP.q)||!isFinite(stI.q)||!isFinite(fp)||!isFinite(fi)){console.log('FAIL diverged at t='+t);process.exit(1);}
  if(Math.abs(stP.q)>10||Math.abs(stI.q)>10){console.log('FAIL unbounded at t='+t);process.exit(1);}
}
var ssP=K_ENV*Math.max(0,stP.q-Q_WALL);  /* 末态接触力（弹簧模型重算） */
var ssI=K_ENV*Math.max(0,stI.q-Q_WALL);
var thP=KP_POS*(R_DES-Q_WALL);
console.log('位置控制: 末态q='+stP.q.toFixed(4)+' 稳态力='+ssP.toFixed(1)+' 峰值力='+pkP.toFixed(1)+' 到0.5rad@'+tPos05.toFixed(2)+'s');
console.log('阻抗控制: 末态q='+stI.q.toFixed(4)+' 稳态力='+ssI.toFixed(1)+' 峰值力='+pkI.toFixed(1)+' 到0.5rad@'+tImp05.toFixed(2)+'s');
console.log('理论稳态力(位置控制)='+thP.toFixed(1));
var fail=0;
if(Math.abs(ssP-thP)/thP>0.15){console.log('FAIL 稳态力偏差>15%');fail=1;}
if(ssI>ssP/5){console.log('FAIL 阻抗稳态力未降到位置控制1/5以下');fail=1;}
if(pkI>pkP){console.log('FAIL 冲击尖峰对比不成立');fail=1;}
if(!(tPos05<tImp05)){console.log('FAIL 自由空间跟踪速度对比不成立');fail=1;}
console.log(fail?'校验失败':'全部通过');
process.exit(fail);
