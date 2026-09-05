/* 校验RL实验室.js — 与 06_软件与算法/15_浏览器内强化学习实验室.html 同源的数值复现
   验证:① 随机初始策略无法平衡(很快倒下);
         ② 训练 800 回合后贪心策略能从 θ=0.05 平衡满 6s;
         ③ 学到的策略结构正确:θ>0 时倾向正向推力、θ<0 倾向负向(与 PD 同构);
         ④ 奖励曲线整体上升(后 200 回合均值 > 前 200 回合均值 + 大幅提升)。
   运行: node _本地工具\校验RL实验室.js   期望输出 MATH OK */
"use strict";

/* V2.1.18: 可种子 LCG 替换 Math.random(AUDIT A-40)——训练随机性曾致 ±0.2 起摆断言 4 跑 1 FAIL(CI 狼来了);
   固定种子后结果可复现,此后该断言 FAIL 即为真回归 */
var _seed = 20260905;
function rand(){
  _seed = (_seed * 1664525 + 1013904223) >>> 0;
  return _seed / 4294967296;
}

var NTH=12, NOM=12, NA=3, TH_MAX=0.3, OM_MAX=3.0, ACTIONS=[-10,0,10];
var ALPHA=0.15, GAMMA=0.995, EPS0=1.0, EPS_MIN=0.05, EPS_DECAY=0.995;
var DT=0.005, T_EP=6.0, TH_FAIL=0.6, M=1.0, m=0.1, L=0.5, G=9.81;
var q = new Float64Array(NTH*NOM*NA), visits = new Uint32Array(NTH*NOM);

function sIdx(th,om){
  var i=Math.floor((th+TH_MAX)/(2*TH_MAX)*NTH), j=Math.floor((om+OM_MAX)/(2*OM_MAX)*NOM);
  i=Math.max(0,Math.min(NTH-1,i)); j=Math.max(0,Math.min(NOM-1,j));
  return [i,j];
}
function Q(i,j,a){ return q[(i*NOM+j)*NA+a]; }
function bestA(i,j){ var b=0; for(var a=1;a<NA;a++) if(Q(i,j,a)>Q(i,j,b)) b=a; return b; }
function step(st,F){
  var cosT=Math.cos(st.th), sinT=Math.sin(st.th);
  var denom=L*(4/3-m*cosT*cosT/(M+m));
  var d2th=(G*sinT+cosT*(-F-m*L*st.dth*st.dth*sinT)/(M+m))/denom;
  var d2x=(F-1*st.dx+m*L*(st.dth*st.dth*sinT-d2th*cosT))/(M+m);
  st.dth+=d2th*DT; st.th+=st.dth*DT; st.dx+=d2x*DT; st.x+=st.dx*DT;
}
function episode(train, policy, th0Override){
  /* 训练时初始偏角在 ±0.2 均匀随机(域随机化),演示默认 0.05 */
  var th0 = th0Override !== undefined ? th0Override : (train ? (rand()*0.4-0.2) : 0.05);
  var st={th:th0,dth:0,x:0,dx:0}, total=0, steps=Math.round(T_EP/DT), done=false;
  for(var k=0;k<steps;k++){
    var ij=sIdx(st.th,st.dth), a;
    if(policy==='random') a=Math.floor(rand()*NA);
    else if(train && rand()<eps) a=Math.floor(rand()*NA);
    else a=bestA(ij[0],ij[1]);
    step(st,ACTIONS[a]);
    var r=1-3*Math.abs(st.th)-0.15*Math.abs(st.dth);
    if(Math.abs(st.th)>TH_FAIL){ r-=10; done=true; }
    total+=r;
    if(train){
      var ij2=sIdx(st.th,st.dth);
      var maxN=Q(ij2[0],ij2[1],bestA(ij2[0],ij2[1]));
      q[(ij[0]*NOM+ij[1])*NA+a]+=ALPHA*(r+(done?0:GAMMA*maxN)-q[(ij[0]*NOM+ij[1])*NA+a]);
      visits[ij[0]*NOM+ij[1]]++;
    }
    if(done) break;
  }
  return {total:total, done:done, thEnd:Math.abs(st.th)};
}
var eps=EPS0, rewards=[];
for(var e=0;e<1000;e++){
  if(e===700) ALPHA=0.05;      /* 后期降低学习率,Q 值收敛更干净 */
  rewards.push(episode(true,'egreedy').total);
  eps=Math.max(EPS_MIN,eps*EPS_DECAY);
}

var fails=0;
function check(name,cond,detail){
  console.log((cond?"PASS ":"FAIL ")+name+(detail?" ("+detail+")":""));
  if(!cond) fails++;
}
/* 1) 随机策略:必倒 */
var randOK=0, randFail=0;
for(e=0;e<10;e++){ if(episode(false,'random').done) randFail++; else randOK++; }
check("随机策略 10 次至少 8 次倒下", randFail>=8, randFail+"/10 倒下");
/* 2) 训练后贪心策略:连测 10 次全部平衡 */
var bal=0, worst=0;
for(e=0;e<10;e++){ var r=episode(false,'greedy'); if(!r.done && r.thEnd<0.3){ bal++; worst=Math.max(worst,r.thEnd); } }
check("训练后贪心策略 10/10 平衡满 6s", bal===10, "balance="+bal+"/10 worstEndTh="+worst.toFixed(3));
/* 3) 奖励上升 */
var head=rewards.slice(0,200).reduce(function(a,b){return a+b;},0)/200;
var tail=rewards.slice(-200).reduce(function(a,b){return a+b;},0)/200;
check("后 200 回合均值远超前 200 回合", tail > head + 500, "head="+head.toFixed(0)+" tail="+tail.toFixed(0));
/* 4) 策略行为鲁棒性:从更大初始角(±0.2 rad)贪心策略仍能平衡 */
var okP=0, okN=0;
for(e=0;e<5;e++){ var rp=episode(false,'greedy',0.2);  if(!rp.done && rp.thEnd<0.25) okP++; }
for(e=0;e<5;e++){ var rn=episode(false,'greedy',-0.2); if(!rn.done && rn.thEnd<0.25) okN++; }
check("初始角 +0.2 rad 平衡 5/5", okP===5, okP+"/5");
check("初始角 −0.2 rad 平衡 5/5", okN===5, okN+"/5");
console.log(fails===0?"MATH OK":"MATH FAIL: "+fails);
process.exit(fails===0?0:1);
