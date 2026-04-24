// Usage: node tests/date-math.test.js
// Mirrors the date/month math embedded in index.html so regressions are caught.

var pass=0,fail=0;
function eq(label,actual,expected){
  var ok=actual===expected;
  (ok?pass++:fail++);
  console.log((ok?'✓':'✗')+' '+label+' => '+actual+(ok?'':' (expected '+expected+')'));
}

// --- addMonths: clamp day to target month's last day (Fix: 31 Jan + 1 = 28/29 Feb)
function addMonths(iso,n){var p=iso.split('-'),y=+p[0],m=+p[1]-1+n,day=+p[2];var lastOfTarget=new Date(y,m+1,0).getDate();var d=new Date(y,m,Math.min(day,lastOfTarget));return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
eq('addMonths 2026-01-31 +1 (non-leap)',addMonths('2026-01-31',1),'2026-02-28');
eq('addMonths 2024-01-31 +1 (leap)',addMonths('2024-01-31',1),'2024-02-29');
eq('addMonths 2026-03-31 +1 (Apr=30)',addMonths('2026-03-31',1),'2026-04-30');
eq('addMonths 2026-12-15 +1 (year roll)',addMonths('2026-12-15',1),'2027-01-15');
eq('addMonths 2026-05-15 +12 (year+1)',addMonths('2026-05-15',12),'2027-05-15');
eq('addMonths 2026-05-31 +3 (Aug=31)',addMonths('2026-05-31',3),'2026-08-31');
eq('addMonths 2026-05-31 +4 (Sep=30)',addMonths('2026-05-31',4),'2026-09-30');
eq('addMonths 2026-10-31 +1 (Nov=30)',addMonths('2026-10-31',1),'2026-11-30');
eq('addMonths 2026-02-28 +1',addMonths('2026-02-28',1),'2026-03-28');

// --- td(): local date, not UTC
function td(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
var now=new Date(),expectedTd=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
eq('td() matches local YYYY-MM-DD',td(),expectedTd);

// --- last7Dates: 7 entries, local time
function last7Dates(){var out=[],today=new Date();for(var i=6;i>=0;i--){var d=new Date(today);d.setDate(today.getDate()-i);out.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'))}return out}
eq('last7Dates length',last7Dates().length,7);
eq('last7Dates[6] is today',last7Dates()[6],expectedTd);

// --- upcomingBills diff: cross-month + day > lastOfMonth clamp
function billDiff(tday,lastOfThis,lastOfNext,rday){
  var thisD=Math.min(rday,lastOfThis),nextD=Math.min(rday,lastOfNext),diff=thisD-tday;
  if(diff<0)diff=lastOfThis-tday+nextD;
  return diff;
}
eq('billDiff cross-month (t=28,last=28,r=1)',billDiff(28,28,31,1),1);
eq('billDiff same-month (t=15,lastThis=30,lastNext=31,r=20)',billDiff(15,30,31,20),5);
eq('billDiff wrap (t=15,lastThis=30,lastNext=31,r=10)',billDiff(15,30,31,10),25);
eq('billDiff day=31 in Feb (t=10,lastThis=28,lastNext=31,r=31)',billDiff(10,28,31,31),18);
eq('billDiff day=31 on Feb 28 = fires today (clamp)',billDiff(28,28,31,31),0);
eq('billDiff day=31 on Feb 27 = 1 day (fires Feb 28)',billDiff(27,28,31,31),1);
eq('billDiff day=31 in Apr (t=15,lastThis=30,lastNext=31,r=31)',billDiff(15,30,31,31),15);
eq('billDiff today bill (t=10,lastThis=30,lastNext=31,r=10)',billDiff(10,30,31,10),0);

// --- YearlyFund remaining months: wrap past dueMonth to next year
function remMonths(dueMonth,curMonth){return dueMonth>=curMonth?dueMonth-curMonth+1:12-curMonth+dueMonth+1}
eq('rem due=3,cur=4 (past, wrap)',remMonths(3,4),12);
eq('rem due=4,cur=4 (this month)',remMonths(4,4),1);
eq('rem due=12,cur=4',remMonths(12,4),9);
eq('rem due=1,cur=12',remMonths(1,12),2);
eq('rem due=2,cur=1',remMonths(2,1),2);
eq('rem due=1,cur=1',remMonths(1,1),1);

// --- Installment split: last item absorbs rounding residue (kuruş)
function splitInstallment(amt,count){
  var per=Math.round((amt/count)*100)/100;
  var parts=[];
  for(var i=0;i<count-1;i++)parts.push(per);
  var last=Math.round((amt-per*(count-1))*100)/100;
  parts.push(last);
  return parts;
}
function sum(arr){return Math.round(arr.reduce(function(a,b){return a+b},0)*100)/100}
eq('split 100/3 sums to 100',sum(splitInstallment(100,3)),100);
eq('split 10/3 sums to 10',sum(splitInstallment(10,3)),10);
eq('split 999.99/7 sums to 999.99',sum(splitInstallment(999.99,7)),999.99);

// --- Installment dashboard totals: use actual item amounts, not a copied per value
function activeInstallmentPlan(items,today,currentMonth){
  var p={total:items[0].installment.total,items:items.slice()};
  p.items.sort(function(a,b){return a.installment.index-b.installment.index});
  p.paid=p.items.filter(function(x){return x.date<=today}).length;
  p.remaining=sum(p.items.filter(function(x){return x.date>today}).map(function(x){return x.amount}));
  p.thisMonth=p.items.find(function(x){return x.date.substring(0,7)===currentMonth});
  p.displayAmount=p.thisMonth?p.thisMonth.amount:(p.items[0]?p.items[0].amount:0);
  return p;
}
var plan100=[
  {date:'2026-01-01',amount:33.33,installment:{index:1,total:3}},
  {date:'2026-02-01',amount:33.33,installment:{index:2,total:3}},
  {date:'2026-03-01',amount:33.34,installment:{index:3,total:3}}
];
var active100=activeInstallmentPlan(plan100,'2026-01-15','2026-03');
eq('installment remaining uses actual unpaid amounts',active100.remaining,66.67);
eq('installment current month uses actual final amount',active100.displayAmount,33.34);

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
