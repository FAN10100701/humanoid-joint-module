/* 临时校验:QUIZ/QUIZ_ADV 键与 27 学科对齐(V2.1.22 题库扩容后自验,可删) */
global.window = {};
['a','b','c','d'].forEach(function(f){ require('../../_assets/ib-data-' + f + '.js'); });
var SUB = window.IB_A.subjects.concat(window.IB_B.subjects, window.IB_C.subjects, window.IB_D.subjects);
var ITEM = window.IB_A.items.concat(window.IB_B.items, window.IB_C.items, window.IB_D.items);
console.log('SUB:', SUB.length, 'ITEM:', ITEM.length);

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var html = fs.readFileSync(path.join(ROOT, '06_学习工具', '11_保研复试面试题库.html'), 'utf8');
function extractDict(name){
  var i = html.indexOf('var ' + name + ' = {');
  if(i < 0) return null;
  var j = html.indexOf('\n  };', i);
  var body = html.slice(i, j);
  var keys = {};
  body.split('\n').forEach(function(l){
    var k = l.match(/^\s{4}([a-z]+):\[/);
    if(k) keys[k[1]] = 1;
  });
  return keys;
}
var Q = extractDict('QUIZ'), QA = extractDict('QUIZ_ADV');
console.log('QUIZ keys:', Q ? Object.keys(Q).length : 'NOT FOUND',
            'QUIZ_ADV keys:', QA ? Object.keys(QA).length : 'NOT FOUND');
var missQ = [], missA = [];
SUB.forEach(function(s){
  if(!Q[s.id]) missQ.push(s.id);
  var isGeneric = ['zs','yy','sx','ky'].indexOf(s.id) >= 0;
  if(!isGeneric && !QA[s.id]) missA.push(s.id);
});
console.log('subjects missing QUIZ:', missQ.length ? missQ.join(',') : 'none');
console.log('non-generic missing QUIZ_ADV:', missA.length ? missA.join(',') : 'none');
var orphanQuiz = Object.keys(Q).filter(function(k){ return !SUB.some(function(s){return s.id===k;}); });
console.log('QUIZ keys w/o subject:', orphanQuiz.length ? orphanQuiz.join(',') : 'none');
