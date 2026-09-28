// Usage: node tests/receipt-camera.test.js
// Canlı kamera tarayıcısı: sahte kamera akışıyla karekodun kendiliğinden okunması, 📸 Çek ile yazı tanıma,
// kamera izni yokken fotoğraf seçimine düşme ve Escape ile kapanma. Playwright yoksa atlanır.
const http=require('http'),fs=require('fs'),path=require('path');
function loadPlaywright(){try{return require('playwright')}catch(e){}try{return require(path.join(require('child_process').execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright'))}catch(e){return null}}
const pw=loadPlaywright();if(!pw){console.log('Playwright bulunamadı; kamera testi atlandı.');process.exit(0)}
const R=path.join(__dirname,'..'),QR=fs.readFileSync(path.join(__dirname,'fixtures','earsiv-qr.txt'),'utf8');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';const f=path.join(R,decodeURIComponent(u));if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){s.writeHead(404);s.end();return}s.writeHead(200,{'Content-Type':u.endsWith('.html')?'text/html; charset=utf-8':u.endsWith('.js')?'text/javascript':'application/octet-stream'});fs.createReadStream(f).pipe(s)});
srv.listen(0,'127.0.0.1',async()=>{
  const b=await pw.chromium.launch();const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  // Sahte kamera: tuvale çizilen görüntüyü akış olarak verir (mode: qr | receipt | deny)
  await ctx.addInitScript(qr=>{
    window.__camMode='qr';
    const orig=navigator.mediaDevices&&navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia=function(){
      if(window.__camMode==='deny')return Promise.reject(Object.assign(new Error('no'),{name:'NotAllowedError'}));
      const c=document.createElement('canvas');c.width=960;c.height=1280;const x=c.getContext('2d');
      const draw=()=>{x.fillStyle='#ddd';x.fillRect(0,0,c.width,c.height);
        if(window.__camMode==='qr'){if(window.__qrImg)x.drawImage(window.__qrImg,270,420,420,420)}
        else{x.fillStyle='#fff';x.fillRect(120,80,720,1100);x.fillStyle='#111';x.font='34px monospace';['BİM BİRLEŞİK MAĞAZALAR A.Ş.','TARİH: 26.09.2026','ÇAY 1KG        *189,50','ŞEKER 3KG      *142,00','TOPKDV          *3,31','TOPLAM        *331,50','NAKİT         *400,00','PARA ÜSTÜ      *68,50'].forEach((l,i)=>x.fillText(l,150,160+i*70))}};
      const im=new Image();im.onload=()=>{window.__qrImg=im;draw()};im.src=qr;draw();setInterval(draw,200);
      return Promise.resolve(c.captureStream(10));
    };
  },QR);
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://127.0.0.1:'+srv.address().port+'/index.html');
  await p.evaluate(()=>{localStorage.clear();localStorage.setItem('pf_a',JSON.stringify([{id:'a1700000000000_aaaa',name:'Banka',type:'bank',owner:'shared',balance:1000,openingBalance:1000,ts:1}]));localStorage.setItem('pf_s',JSON.stringify({onboarded:true}))});
  await p.reload();await p.waitForFunction(()=>window.App&&App.Receipt);
  const out={};
  // 1) Karekod: tarayıcı açılır, karekodu kendiliğinden yakalar
  await p.evaluate(()=>App.Receipt.open());
  await p.waitForSelector('#rcpScan',{state:'attached'});
  await p.waitForSelector('#rcpReview',{state:'attached',timeout:15000});
  out.qr=await p.evaluate(()=>{const h=document.getElementById('rcpReview');return[h.querySelector('[data-rk="amount"]').value,h.querySelector('[data-rk="date"]').value,h.querySelector('.rcp-src').textContent,!!document.getElementById('rcpScan')]});
  out.streamStopped=await p.evaluate(()=>!document.querySelector('#rcpScan video'));
  await p.evaluate(()=>App.UI.closeModal('rcpReview'));
  // 2) Karekodsuz fiş: Çek → yazı tanıma
  await p.evaluate(()=>{window.__camMode='receipt';App.Receipt.open()});
  await p.waitForSelector('#rcpScan',{state:'attached'});await p.waitForTimeout(1200);
  await p.evaluate(()=>document.querySelector('#rcpScan [data-act="shot"]').click());
  await p.waitForSelector('#rcpReview',{state:'attached',timeout:60000});
  out.shot=await p.evaluate(()=>{const h=document.getElementById('rcpReview');return[h.querySelector('[data-rk="amount"]').value,h.querySelector('[data-rk="date"]').value,h.querySelector('[data-rk="note"]').value,h.querySelector('[data-rk="category"]').value]});
  await p.evaluate(()=>App.UI.closeModal('rcpReview'));
  // 3) Kamera izni yok → fotoğraf seçimine düşer
  await p.evaluate(()=>{window.__camMode='deny';window.__picked=0;document.getElementById('receiptFile').click=()=>{window.__picked++};App.Receipt.open()});
  await p.waitForTimeout(300);
  out.denyFallback=await p.evaluate(()=>[window.__picked,!!document.getElementById('rcpScan')]);
  // 4) Escape kamerayı kapatır
  await p.evaluate(()=>{window.__camMode='receipt';App.Receipt.open()});await p.waitForTimeout(500);await p.keyboard.press('Escape');await p.waitForTimeout(600);
  out.escClosed=await p.evaluate(()=>!document.getElementById('rcpScan'));
  let pass=0,fail=0;const eq=(l,a,e)=>{const ok=JSON.stringify(a)===JSON.stringify(e);ok?pass++:fail++;console.log((ok?'✓':'✗')+' '+l+' => '+JSON.stringify(a)+(ok?'':' (expected '+JSON.stringify(e)+')'))};
  eq('live camera reads e-Arşiv QR automatically',out.qr,['523,40','2026-09-20','✓ Fişin karekodundan okundu.',false]);
  eq('camera stopped after QR',out.streamStopped,true);
  eq('shot without QR goes through text recognition',out.shot,['331,50','2026-09-26','BİM','Market']);
  eq('camera denied falls back to photo picker',out.denyFallback,[1,false]);
  eq('Escape closes the scanner',out.escClosed,true);
  eq('no page errors',errs,[]);
  await b.close();srv.close();console.log('\n'+pass+' passed, '+fail+' failed');process.exit(fail?1:0);
});
