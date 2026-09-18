const $ = (id) => document.getElementById(id);
function toast(msg){ const x=$('toast'); x.textContent=msg; x.classList.add('show'); setTimeout(()=>x.classList.remove('show'),2600); }

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab,.panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.id).classList.add('active');});

window.sbky.getConfig().then(c=>{ $('room').value=c.roomName || 'Class 1'; });
$('room').onchange=()=>window.sbky.setRoom($('room').value);
window.sbky.onStatus(({status,detail})=>{ $('dot').className='dot '+(status==='connected'?'live':status==='error'?'bad':''); $('statusText').textContent=status==='connected'?'Connected — ready for alerts':status==='error'?'Connection problem':'Connecting…'; if(detail) console.log(detail); });
window.sbky.onRemoteTest(()=>toast('Connection test received ✓'));

$('localTest').onclick=()=>window.sbky.localTestAlert();
$('localClear').onclick=()=>window.sbky.localClearAlert();
$('lock').onclick=async()=>{ if(!confirm('Trigger LOCKDOWN on all connected classroom laptops?')) return; try{await window.sbky.sendLockdown($('pin').value);toast('LOCKDOWN sent');}catch(e){alert(e.message)} };
$('clear').onclick=async()=>{ if(!confirm('Send ALL CLEAR to all connected laptops?')) return; try{await window.sbky.sendClear($('pin').value);toast('ALL CLEAR sent');}catch(e){alert(e.message)} };
$('testBroadcast').onclick=async()=>{ try{await window.sbky.sendTest($('pin').value);toast('Test sent');}catch(e){alert(e.message)} };