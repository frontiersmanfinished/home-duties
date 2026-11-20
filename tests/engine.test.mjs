import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
const T='2026-11-19', S=E.DEFAULT_SEASONS, who={id:'p1',name:'Alex'};
const since=(days,o={})=>E.newChore({id:'c'+Math.random(),title:'Wipe x',startDate:T,repeat:{type:'since',days,weekday:1,everyWeeks:1},...o});
const bins=(o={})=>E.newChore({id:'b',title:'Put bins out',startDate:T,repeat:{type:'fixed',days:7,weekday:1,everyWeeks:1},holidayShift:true,alt:{anchor:'2026-12-01',offset:1,labels:['general + recycling','general + organics'],format:'Bins out: {label}'},...o});
// dates
assert.equal(E.weekday('2026-11-24'),2); assert.equal(E.addMonths('2026-01-31',1),'2026-02-28');
assert.equal(E.parseDueInput('+2d',T),'2026-11-21'); assert.equal(E.parseDueInput('+3w',T),'2026-12-10'); assert.equal(E.parseDueInput('+1m',T),'2026-12-19');
// since last done
let c=since(7); assert.equal(E.stateOf(c,T,S).due,'2026-11-26'); assert.equal(E.stateOf(c,'2026-11-29',S).status,'overdue'); assert.equal(E.stateOf(c,'2026-11-29',S).daysLate,3);
// fixed + alternating + roll forward
c=bins(); let s=E.stateOf(c,T,S); assert.equal(s.due,'2026-11-23'); assert.equal(s.title,'Bins out: general + organics');
s=E.stateOf(c,'2026-11-30',S); assert.equal(s.due,'2026-11-30'); assert.equal(s.status,'today'); assert.equal(s.title,'Bins out: general + recycling');
s=E.stateOf(c,'2026-11-24',S); assert.equal(s.status,'overdue');
let off=bins({rollForward:false}); assert.equal(E.stateOf(off,'2026-12-08',S).due,'2026-11-23');
let d=E.doneChanges(c,E.stateOf(c,'2026-11-23',S),Date.UTC(2026,10,23,8),who,'2026-11-23'); c={...c,...d.patch}; assert.equal(E.stateOf(c,'2026-11-24',S).due,'2026-11-30');
// holiday: Tue 25 Dec 2029 pickup moves both chores a day later
let h=bins({startDate:'2029-12-20'}); assert.equal(E.stateOf(h,'2029-12-20',S).due,'2029-12-25'); assert.equal(E.stateOf(h,'2029-12-20',S).occ,'2029-12-25');
let hin=E.newChore({title:'in',startDate:'2029-12-20',holidayShift:true,repeat:{type:'fixed',days:7,weekday:2,everyWeeks:1}}); assert.equal(E.stateOf(hin,'2029-12-20',S).due,'2029-12-26');
// rollover
c=since(1,{rollsOver:true,startDate:'2026-11-10'}); s=E.stateOf(c,T,S); assert.equal(s.status,'rollover'); assert.equal(s.daysLate,0);
assert.equal(E.stateOf({...c,tickedOn:T},T,S).ticked,true); assert.equal(E.stateOf({...c,tickedOn:T},'2026-11-20',S).ticked,false); assert.equal(E.stateOf({...c,tickedOn:T},'2026-11-20',S).status,'rollover');
// seasons
const mow=since(14,{seasonal:{growing:{days:7},winter:{days:14}}}); assert.equal(E.stateOf(mow,T,S).interval,7); assert.equal(E.stateOf(mow,'2027-07-01',S).interval,14);
const bbq=since(30,{seasonal:{growing:{days:30},winter:{paused:true}}}); assert.equal(E.stateOf(bbq,'2027-07-01',S).status,'resting'); assert.equal(E.stateOf(bbq,'2027-07-01',S).restingUntil,'2027-09-01'); assert.equal(E.stateOf(bbq,'2027-09-01',S).status,'today');
const pool=since(7,{months:[10,11,12,1,2,3,4]}); assert.equal(E.stateOf(pool,'2027-06-01',S).status,'resting'); assert.equal(E.stateOf(pool,'2027-10-01',S).due,'2027-10-01');
const reset=since(365,{months:[9,10]}); assert.equal(E.stateOf(reset,T,S).due,'2027-09-01'); assert.equal(E.stateOf(reset,'2027-11-05',S).status,'overdue');
const close=since(365,{months:[4,5]}); assert.equal(E.stateOf(close,T,S).due,'2027-04-01');
// skip/snooze/undo
c=since(7); s=E.stateOf(c,'2026-11-26',S); d=E.doneChanges(c,s,Date.UTC(2026,10,26,3),who,'2026-11-26','skip'); let sk={...c,...d.patch,id:c.id}; assert.equal(sk.last,null); assert.equal(E.stateOf(sk,'2026-11-26',S).due,'2026-12-03'); assert.deepEqual({...sk,...d.undo}.skip,null);
assert.equal(E.stateOf({...c,snoozedUntil:'2026-11-29'},'2026-11-27',S).status,'soon');
// range repeat
const rg=since(10,{repeat:{type:'since',days:10,daysMax:14,weekday:1,everyWeeks:1}}); assert.equal(E.stateOf(rg,'2026-12-01',S).status,'today'); assert.equal(E.stateOf(rg,'2026-12-03',S).status,'today'); assert.equal(E.stateOf(rg,'2026-12-05',S).daysLate,2);
// as needed
let an=E.newChore({id:'an',title:'Clean car seats',startDate:'2026-11-01',repeat:{type:'asneeded',days:7,nudgeDays:null}});
s=E.stateOf(an,T,S); assert.equal(s.status,'asneeded'); assert.equal(s.due,null); assert.equal(s.nudge,false); assert.equal(s.sinceDays,18);
assert.equal(E.stateOf({...an,repeat:{...an.repeat,nudgeDays:14}},T,S).nudge,true);
d=E.doneChanges(an,s,new Date(2026,10,19,10).getTime(),who,T); an={...an,...d.patch}; s=E.stateOf(an,'2026-11-25',S); assert.equal(s.status,'asneeded'); assert.equal(s.sinceDays,6); assert.equal(E.sinceText(s),'6 days since last done');
assert.equal(E.buildToday([an],T,S,'all',null).asNeeded.length,1); assert.equal(E.buildToday([an],T,S,'all',null).overdueCount,0);
assert.equal(E.rowsFromText('Chore,Frequency\nClean car seats,As needed')[0].asNeeded,true);
// quick wins skip chores done today; awkward verbs fall back to Done
let qw=since(2,{title:'Put washing on',effort:5}); qw={...qw,...E.doneChanges(qw,E.stateOf(qw,T,S),new Date(2026,10,19,9).getTime(),who,T).patch};
assert.equal(E.stateOf(qw,T,S).status,'soon'); assert.equal(E.buildToday([qw],T,S,'all',null).quick.length,0); assert.equal(E.buildToday([qw],'2026-11-20',S,'all',null).next?.chore.title,'Put washing on'); assert.equal(E.buildToday([qw],T,S,'all',null).next,null);
assert.equal(E.lastDoneText(qw,T),'Done today by Alex'); assert.equal(E.pastVerb('Put bins out'),'Done');
// streak
const L=(day,kind='done')=>({day,kind}); assert.equal(E.streak([L(T),L('2026-11-18'),L('2026-11-17','skip'),L('2026-11-16')],T),3); assert.equal(E.streak([L('2026-11-18')],T),1); assert.equal(E.streak([L('2026-11-17')],T),0);
// import
const rows=E.rowsFromText('Chore,Area,Frequency,IntervalDays,EstMinutes,RollsOver,ActiveMonths\n"Sweep paths, porch",Outdoor,Weekly,7,15,No,\nFeed pets,Pets,Daily,1,5,Yes,\nBrush,Pool,Weekly,7,15,No,Oct-Apr');
assert.equal(rows.length,3); assert.equal(rows[0].title,'Sweep paths, porch'); assert.equal(rows[1].rollsOver,true); assert.deepEqual(rows[2].months,[10,11,12,1,2,3,4]);
assert.equal(E.rowsFromText('one\n- two').length,2);
const many=Array.from({length:20},(_, i)=>({id:'x'+i,title:'x'+i,days:7})); const ch=E.choresFromRows(many,T); const ds=ch.map(c=>E.diffDays(c.dueDate,T)); assert.equal(Math.min(...ds),5); assert.equal(Math.max(...ds),9); assert.ok(new Set(ds).size===5);
assert.equal(E.lastDoneText({...since(7,{title:'Vacuum floors'}),last:{at:new Date(2026,10,10,12).getTime(),byName:'Alex'}},T),'Vacuumed 9 days ago by Alex');
console.log('engine tests passed');
