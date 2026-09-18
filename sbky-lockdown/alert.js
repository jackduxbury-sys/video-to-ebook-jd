const alarm=document.getElementById('alarm'); alarm.volume=1;
function play(){alarm.currentTime=0; alarm.play().catch(()=>{});} function stop(){alarm.pause(); alarm.currentTime=0;}
window.alertAPI.onLockdown((x)=>{ document.getElementById('meta').textContent=`${x.roomName||''} • Alert issued ${new Date(x.issuedAt||Date.now()).toLocaleTimeString()}`; document.getElementById('test').classList.toggle('show',!!x.test); document.getElementById('ack').textContent='I HAVE SEEN THIS ALERT'; play(); });
window.alertAPI.onAllClear(()=>stop());
window.alertAPI.onAcknowledged(()=>{stop(); document.getElementById('ack').textContent='ALERT ACKNOWLEDGED ✓';});
document.getElementById('ack').onclick=()=>window.alertAPI.acknowledge();