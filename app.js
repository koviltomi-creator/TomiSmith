const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = { active:false, paused:false, muted:false, seconds:0, timer:null, outcome:'Érdeklődik', messages:[], recognition:null, listening:false, speechToken:0 };
const replies = {
  most:'Teljesen jogos. Árat csak az alkalom és a létszám ismeretében mondanék, különben csak találgatnék. Milyen keretben gondolkodnak? Ahhoz nézünk reális lehetőségeket.',
  time:'Persze, nem tartom fel. Mikor lenne jobb visszahívni? Ha egyszerűbb, előtte küldök egy rövid e-mailt.',
  partner:'Értem, és nem is lecserélni szeretnénk őket. Inkább tartalék vagy más hangulatú programokhoz mutatnánk pár lehetőséget. Ennek lenne értelme?',
  email:'Rendben. Hogy ne egy általános anyagot kapjon: inkább vacsoraest, céges rendezvény vagy esküvő a gyakoribb? Utána visszaolvasom a címet.'
};
const script = [
  'Jó napot! Anna vagyok, az Artmaster Media AI asszisztense. Azért keresem, mert szállodáknak segítünk élőzenei programokat összeállítani. Belefér most egy nagyon rövid kérdés?',
  'Köszönöm. Önöknél inkább vacsoraestekhez, céges rendezvényekhez vagy esküvőkhöz szokott felmerülni élőzene?',
  'Értem. És mi számít igazán: hogy passzoljon a hely hangulatához, hogy egyszerű legyen a szervezés, vagy inkább a keret a döntő?',
  'Rendben. Akkor nem általános bemutatkozót küldenénk, hanem pár odaillő ötletet. Melyik e-mail-címre mehet?'
];

function toast(text){ const el=$('#toast'); el.textContent=text; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2400); }
function timeNow(){ return new Date().toLocaleTimeString('hu-HU',{hour:'2-digit',minute:'2-digit'}); }
function setStatus(text,type='ready'){ $('#statusText').textContent=text; $('#agentState').textContent=type==='speak'?'Anna beszél':type==='listen'?'Anna figyel':'Anna, az AI asszisztens'; $('#agentOrb').classList.toggle('speaking',type==='speak'); }
function addMessage(role,text){
  $('#emptyTranscript')?.remove(); const wrap=document.createElement('article'); wrap.className=`message ${role}`;
  const head=document.createElement('header'); head.textContent=`${role==='ai'?'ANNA · AI':'ÖN'}  ·  ${timeNow()}`;
  const p=document.createElement('p'); p.textContent=text; wrap.append(head,p); $('#messages').append(wrap); $('#messages').scrollTop=$('#messages').scrollHeight;
  state.messages.push({role,text,time:timeNow()}); $('#currentLine').textContent=text;
}
const femaleVoicePattern = /noemi|noémi|szabina|eszter|anna|female|zira|hazel|susan|samantha|victoria|karen|moira|ava|serena/i;
const maleVoicePattern = /szabolcs|tamás|tamas|male|david|mark|george/i;
let availableVoices = [];
function voiceScore(v){ const hu=v.lang?.toLowerCase().startsWith('hu'); const female=femaleVoicePattern.test(v.name); const male=maleVoicePattern.test(v.name); return (hu?100:0)+(female?60:0)-(male?80:0)+(v.localService?2:0); }
function refreshVoices(){
  if(!('speechSynthesis' in window))return [];
  availableVoices=window.speechSynthesis.getVoices().slice().sort((a,b)=>voiceScore(b)-voiceScore(a));
  const select=$('#voiceSelect'), previous=select.value; select.innerHTML='';
  availableVoices.filter(v=>v.lang?.toLowerCase().startsWith('hu')||femaleVoicePattern.test(v.name)).forEach(v=>{const o=document.createElement('option');o.value=v.name;o.textContent=`${femaleVoicePattern.test(v.name)?'Női':'Rendszer'} · ${v.name.replace(/Microsoft |Google /g,'')}`;select.append(o)});
  if(previous&&availableVoices.some(v=>v.name===previous))select.value=previous; else if(availableVoices[0])select.value=availableVoices[0].name;
  if(!select.options.length){const o=document.createElement('option');o.value='';o.textContent='Nőiesített magyar rendszerhang';select.append(o)}
  return availableVoices;
}
async function ensureVoices(){
  let voices=refreshVoices(); if(voices.length)return voices;
  await new Promise(resolve=>{let tries=0;const tick=()=>{voices=refreshVoices();if(voices.length||++tries>15)resolve();else setTimeout(tick,100)};window.speechSynthesis.onvoiceschanged=tick;setTimeout(tick,80)});return voices;
}
function chooseVoice(){const selected=$('#voiceSelect').value;return availableVoices.find(v=>v.name===selected)||availableVoices[0];}
function splitForSpeech(text){
  const sentences=text.match(/[^.!?;:]+[.!?;:]?/g)?.map(s=>s.trim()).filter(Boolean)||[text];
  return sentences.flatMap(sentence=>sentence.length<125?[sentence]:sentence.split(/,\s+/).reduce((parts,part)=>{const last=parts.at(-1);if(last&&(last+' '+part).length<125)parts[parts.length-1]=last+', '+part;else parts.push(part);return parts},[]));
}
function speakChunk(text,voice,pitch,token){
  return new Promise(resolve=>{if(token!==state.speechToken)return resolve();const u=new SpeechSynthesisUtterance(text);u.lang='hu-HU';u.rate=.98;u.pitch=pitch;if(voice)u.voice=voice;let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(safety);resolve()};u.onend=finish;u.onerror=finish;const safety=setTimeout(finish,Math.max(3500,text.length*105));window.speechSynthesis.speak(u)});
}
async function speak(text){
  addMessage('ai',text); if(state.muted || !('speechSynthesis' in window)){ setStatus('Válaszra vár','listen'); return; }
  const token=++state.speechToken;setStatus('Női hang betöltése…');await ensureVoices();if(token!==state.speechToken)return;window.speechSynthesis.cancel();await new Promise(r=>setTimeout(r,70));
  const voice=chooseVoice(), pitch=voice&&femaleVoicePattern.test(voice.name)?1.03:1.25;setStatus('AI beszél','speak');
  for(const chunk of splitForSpeech(text)){if(token!==state.speechToken)return;await speakChunk(chunk,voice,pitch,token);if(token===state.speechToken)await new Promise(r=>setTimeout(r,55));}
  if(token===state.speechToken)setStatus('Válaszra vár','listen');
}
function startCall(withIntro=true){
  if(state.active){ finish(false); return; }
  state.active=true; state.seconds=0; $('#callButton').classList.add('end'); $('#callButton b').textContent='Demóhívás befejezése'; setStatus('Kapcsolódás…');
  state.timer=setInterval(()=>{state.seconds++; $('#timer').textContent=`${String(Math.floor(state.seconds/60)).padStart(2,'0')}:${String(state.seconds%60).padStart(2,'0')}`},1000);
  if(withIntro)setTimeout(()=>speak(script[0]),650);
}
function finish(show=true){
  if(!state.active && !show){return} state.active=false; state.speechToken++;clearInterval(state.timer); window.speechSynthesis?.cancel(); stopListening(); $('#callButton').classList.remove('end'); $('#callButton b').textContent='Demóhívás indítása'; setStatus('Hívás lezárva');
  if(show)showSummary();
}
function respond(text){
  if(!text.trim())return; state.speechToken++;window.speechSynthesis?.cancel();if(!state.active) startCall(false); addMessage('user',text.trim()); setStatus('AI gondolkodik…');
  const lower=text.toLowerCase(); let answer;
  if(/drága|költség|ár/.test(lower))answer=replies.most;
  else if(/nincs idő|siet|később/.test(lower))answer=replies.time;
  else if(/partner|zenekarunk|beszállító/.test(lower))answer=replies.partner;
  else if(/email|e-mail|levél/.test(lower))answer=replies.email;
  else if(/igen|alkalmas|persze|rendben|hallgatom/.test(lower))answer=script[1];
  else if(/vacsora|esküvő|céges|rendezvény|program/.test(lower))answer=script[2];
  else if(/stílus|vendég|keret|technika|fontos/.test(lower))answer=script[3];
  else answer='Értem. Nem szeretnék találgatni: milyen eseményről van szó, és körülbelül hány vendéggel számolnak?';
  setTimeout(()=>speak(answer),650);
}
function setupRecognition(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR)return null; const rec=new SR(); rec.lang='hu-HU'; rec.interimResults=false; rec.continuous=false;
  rec.onresult=e=>{const text=[...e.results].map(r=>r[0].transcript).join(' '); respond(text)};
  rec.onend=()=>{state.listening=false; $('#micButton').classList.remove('active'); if(state.active)setStatus('Válaszra vár','listen')};
  rec.onerror=e=>{state.listening=false; $('#micButton').classList.remove('active'); $('#permissionHint').textContent=e.error==='not-allowed'?'A mikrofon nincs engedélyezve · írj választ alul':'A hangfelismerés most nem elérhető · írj választ alul'}; return rec;
}
async function toggleMic(){
  if(state.listening){stopListening();return} if(!state.active)startCall();
  try{await navigator.mediaDevices.getUserMedia({audio:true}); state.recognition=state.recognition||setupRecognition(); if(!state.recognition){toast('Ebben a böngészőben a szöveges válasz használható.');return} state.recognition.start();state.listening=true;$('#micButton').classList.add('active');setStatus('Mikrofon aktív','listen');$('#permissionHint').textContent='Beszélj természetesen magyarul…'}catch(e){toast('A mikrofon nem engedélyezett — a szöveges mező továbbra is működik.');}
}
function stopListening(){try{state.recognition?.stop()}catch(e){} state.listening=false;$('#micButton').classList.remove('active')}
function spellEmail(email){return email.replace('@',' kukac ').replaceAll('.',' pont ').replaceAll('-',' kötőjel ')}
function summaryText(){
  const lastUser=[...state.messages].reverse().find(m=>m.role==='user')?.text||'Nem hangzott el ügyfélválasz.';
  return {hotel:$('#hotelName').value||'Nincs megadva',contact:$('#contactName').value||'Nincs megadva',interest:$('#interest').value,outcome:state.outcome,email:$('#emailOne').value||'Nincs megadva',duration:$('#timer').textContent,note:$('#notes').value||lastUser};
}
function showSummary(){
  const s=summaryText(); $('#summaryBody').innerHTML=`<div class="summary-item"><span>ÜGYFÉL</span><strong>${escapeHtml(s.hotel)}</strong></div><div class="summary-item"><span>KAPCSOLATTARTÓ</span><strong>${escapeHtml(s.contact)}</strong></div><div class="summary-item"><span>ÉRDEKLŐDÉS</span><strong>${escapeHtml(s.interest)}</strong></div><div class="summary-item"><span>EREDMÉNY</span><strong>${escapeHtml(s.outcome)}</strong></div><div class="summary-item"><span>E-MAIL</span><strong>${escapeHtml(s.email)}</strong></div><div class="summary-item"><span>IDŐTARTAM</span><strong>${s.duration}</strong></div><div class="summary-item wide"><span>KÖVETKEZŐ LÉPÉS / MEGJEGYZÉS</span><p>${escapeHtml(s.note)}</p></div>`;
  localStorage.setItem('artmaster-demo-last-call',JSON.stringify({...s,savedAt:new Date().toISOString(),demo:true}));$('#saveState').textContent='Helyben mentve';$('#summaryDialog').showModal();
}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

$('#launchDemo').onclick=()=>{$('#demo').scrollIntoView({behavior:'smooth'});setTimeout(startCall,700)};
$('#callButton').onclick=startCall; $('#micButton').onclick=toggleMic;
$('#pauseButton').onclick=()=>{if(!state.active)return toast('Előbb indítsd el a demót.');state.paused=!state.paused;if(state.paused){window.speechSynthesis?.pause();clearInterval(state.timer);setStatus('Szünetel');$('#pauseButton').classList.add('active')}else{window.speechSynthesis?.resume();state.timer=setInterval(()=>{state.seconds++;$('#timer').textContent=`${String(Math.floor(state.seconds/60)).padStart(2,'0')}:${String(state.seconds%60).padStart(2,'0')}`},1000);setStatus('Folytatás','listen');$('#pauseButton').classList.remove('active')}};
$('#soundToggle').onclick=()=>{state.muted=!state.muted;$('#soundToggle').style.color=state.muted?'#ff766e':'';if(state.muted){state.speechToken++;window.speechSynthesis?.cancel()}toast(state.muted?'AI-hang kikapcsolva':'AI-hang bekapcsolva')};
$('#replyForm').onsubmit=e=>{e.preventDefault();const i=$('#replyInput');respond(i.value);i.value=''};
$('#clearTranscript').onclick=()=>{$('#messages').innerHTML='<div class="empty-state" id="emptyTranscript"><span>◌</span><p>Az átirat a következő üzenetnél jelenik meg.</p></div>';state.messages=[]};
$$('.objection').forEach(b=>b.onclick=()=>{state.speechToken++;window.speechSynthesis?.cancel();if(!state.active)startCall(false);addMessage('user',b.querySelector('span').textContent.replaceAll('„','').replaceAll('”',''));setTimeout(()=>speak(replies[b.dataset.objection]),450)});
$$('.signal button').forEach(b=>b.onclick=()=>{$$('.signal button').forEach(x=>x.classList.toggle('active',+x.dataset.level<=+b.dataset.level));$('#interestLabel').textContent=['Hideg','Hűvös','Meleg','Erős','Forró'][+b.dataset.level-1]});
$$('.outcome-options button').forEach(b=>b.onclick=()=>{$$('.outcome-options button').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');state.outcome=b.dataset.outcome});
$('#readEmail').onclick=()=>{const e=$('#emailOne').value.trim();if(!e)return toast('Előbb add meg az e-mail-címet.');speak(`Visszaolvasom: ${spellEmail(e)}. Jól értettem?`)};
$('#verifyEmail').onclick=()=>{const a=$('#emailOne').value.trim().toLowerCase(),b=$('#emailTwo').value.trim().toLowerCase(),v=$('#emailValidation');if(!a||!b){v.className='validation error';v.textContent='Mindkét mezőt töltsd ki.'}else if(a===b&&/^\S+@\S+\.\S+$/.test(a)){v.className='validation ok';v.textContent='✓ Az e-mail-cím egyezik és rögzíthető.'}else{v.className='validation error';v.textContent='× A két cím nem egyezik, vagy a formátum hibás.'}};
$('#finishCall').onclick=()=>finish(true);$('#closeSummary').onclick=()=>$('#summaryDialog').close();
$('#newCall').onclick=()=>{$('#summaryDialog').close();$('#timer').textContent='00:00';state.messages=[];$('#messages').innerHTML='<div class="empty-state" id="emptyTranscript"><span>◌</span><p>Az átirat a demó indításakor jelenik meg.</p></div>';setStatus('Készen áll');$('#currentLine').textContent='Indítsd el a demót, és válaszd ki, hogyan szeretnél válaszolni.'};
$('#copySummary').onclick=async()=>{const s=summaryText();const t=`Artmaster Media — demó hívásösszefoglaló\nÜgyfél: ${s.hotel}\nKapcsolattartó: ${s.contact}\nÉrdeklődés: ${s.interest}\nEredmény: ${s.outcome}\nE-mail: ${s.email}\nIdőtartam: ${s.duration}\nMegjegyzés: ${s.note}`;await navigator.clipboard.writeText(t);toast('Összefoglaló másolva')};
if('speechSynthesis' in window){window.speechSynthesis.onvoiceschanged=refreshVoices;refreshVoices();}
