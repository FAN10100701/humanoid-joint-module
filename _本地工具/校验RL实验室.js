/* 校验RL实验室.js — 与 06_软件与算法/15_浏览器内强化学习实验室.html 同源的数值复现
   验证:① 随机初始策略无法平衡(很快倒下);
         ② 训练 800 回合后贪心策略能从 θ=0.05 平衡满 6s;
         ③ 学到的策略结构正确:θ>0 时倾向正向推力、θ<0 倾向负向(与 PD 同构);
         ④ 奖励曲线整体上升(后 200 回合均值 > 前 200 回合均值 + 大幅提升)。
   运行: node _本地工具\校验RL实验室.js   期望输出 MATH OK */
"use strict";

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
function episode(train, policy){
  /* 训练时随机初始偏角方向,保证左右两侧状态被对称探索 */
  var th0 = train ? (Math.random()<0.5?-0.05:0.05) : 0.05;
  var st={th:th0,dth:0,x:0,dx:0}, total=0, steps=Math.round(T_EP/DT), done=false;
  for(var k=0;k<steps;k++){
    var ij=sIdx(st.th,st.dth), a;
    if(policy==='random') a=Math.floor(Math.random()*NA);
    else if(train && Math.random()<eps) a=Math.floor(Math.random()*NA);
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
for(var e=0;e<800;e++){
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
/* 4) 策略结构:仅在"θ 与 ω 同号(正远离直立)"的象限断言推力方向;
      反向象限(正在回摆)"保持/刹车"也是合理最优,不做强断言 */
var pos=0, totPos=0, neg=0, totNeg=0;
for(var i=0;i<NTH;i++) for(var j=0;j<NOM;j++){
  if(visits[i*NOM+j]===0) continue;
  var a=bestA(i,j);
  if(i>=NTH*2/3 && j>=NOM/2){ totPos++; if(a===2) pos++; }   /* θ>0 且 ω>0:应正向推 */
  if(i<=NTH/3 && j<=NOM/2){ totNeg++; if(a===0) neg++; }     /* θ<0 且 ω<0:应负向推 */
}
check("右倒+右摆象限主要正向推力", totPos>0 && pos/totPos>0.55, Math.round(pos)+"/"+totPos);
check("左倒+左摆象限主要负向推力", totNeg>0 && neg/totNeg>0.55, Math.round(neg)+"/"+totNeg);
console.log(fails===0?"MATH OK":"MATH FAIL: "+fails);
process.exit(fails===0?0:1);
