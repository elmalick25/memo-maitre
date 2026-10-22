import test from "node:test"; import assert from "node:assert/strict";
import { curateNovaBatch, scheduleNovaCards, sanitizeNovaBacklog } from "../lib/novaReserve.js";
const err=i=>({id:"e"+i,front:"❌ x"+i,source:"user_error",_source:"user_error",_agentDetected:true});
const voc=i=>({id:"v"+i,front:"idiom"+i,source:"coach_input",_source:"coach_input",_agentDetected:true});
test("toutes les erreurs gardées, vocabulaire plafonné à 5 par session",()=>{
  const {kept}=curateNovaBatch([...Array(8)].map((_,i)=>voc(i)).concat([err(1),err(2)]),0);
  assert.equal(kept.filter(c=>c.source==="user_error").length,2);
  assert.equal(kept.filter(c=>c.source==="coach_input").length,5);
});
test("aucune fiche créée n'est due aujourd'hui, 10 erreurs max par jour",()=>{
  const out=scheduleNovaCards([...Array(25)].map((_,i)=>err(i)),[],"2026-10-16");
  assert.ok(out.every(c=>c.nextReview>"2026-10-16"));
  assert.equal(out.filter(c=>c.nextReview==="2026-10-17").length,10);
  assert.equal(out.filter(c=>c.nextReview==="2026-10-19").length,5);
});
test("stock en retard jamais révisé réétalé (10 erreurs aujourd'hui)",()=>{
  const old=[...Array(30)].map((_,i)=>({...err(i),repetitions:0,nextReview:"2026-10-01"}));
  const {list,moved}=sanitizeNovaBacklog(old,"2026-10-16");
  assert.equal(moved,30);
  assert.equal(list.filter(c=>c.nextReview==="2026-10-16").length,10);
  assert.ok(list.every(c=>c.nextReview>="2026-10-16"));
});
