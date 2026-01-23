document.addEventListener('DOMContentLoaded', () => {
    const els = {
        balance: document.getElementById('currentBalance'),
        history: document.getElementById('transactionHistory'),
        main: document.getElementById('mainPaymentSection'),
        qrReader: document.getElementById('qrReaderSection'),
        video: document.getElementById('qrCameraVideo'),
        canvas: document.getElementById('qrCanvas'),
        scannedAmount: document.getElementById('scannedAmount'),
        readDisplay: document.getElementById('readAmountDisplay'),
        confirmPay: document.getElementById('confirmPayBtn'),
        paymentComp: document.getElementById('paymentCompletionSection'),
        chargeSection: document.getElementById('chargeSection'),
        chargeComp: document.getElementById('chargeCompletionSection'),
        receiveQr: document.getElementById('receiveQrSection'),
        receiveComp: document.getElementById('receiveCompletionSection')
    };

    let balance = parseFloat(localStorage.getItem('customerBalance')) || 0;
    let transactions = JSON.parse(localStorage.getItem('customerTransactions')) || [];
    let videoStream = null;
    let requestAnimId = null;
    let scannedData = null;
    let timer = null;
    const myId = localStorage.getItem('customerMockPayPayId') || `CUST-${Math.floor(Math.random()*900000)+100000}`;
    localStorage.setItem('customerMockPayPayId', myId);

    function show(target) {
        if (timer) clearTimeout(timer);
        [els.main, els.qrReader, els.chargeSection, els.paymentComp, els.chargeComp, els.receiveQr, els.receiveComp].forEach(s => s?.classList.add('hidden'));
        target?.classList.remove('hidden');
    }

    function updateUI() {
        els.balance.textContent = `¥ ${balance.toLocaleString()}`;
        els.history.innerHTML = transactions.slice().reverse().map(t => 
            `<li><span>${t.type==='payment'?'支払い':'入金'}</span><span>¥ ${t.amount.toLocaleString()}</span></li>`).join('');
    }

    // --- カメラ (安定版) ---
    function startScan() {
        show(els.qrReader);
        els.readDisplay.classList.add('hidden');
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
            videoStream = stream;
            els.video.srcObject = stream;
            els.video.play();
            requestAnimId = requestAnimationFrame(tick);
        });
    }

    function tick() {
        if (els.video.readyState === els.video.HAVE_ENOUGH_DATA) {
            els.canvas.width = els.video.videoWidth;
            els.canvas.height = els.video.videoHeight;
            const ctx = els.canvas.getContext('2d');
            ctx.drawImage(els.video, 0, 0);
            const code = jsQR(ctx.getImageData(0,0,els.canvas.width,els.canvas.height).data, els.canvas.width, els.canvas.height);
            if (code) {
                try {
                    const data = JSON.parse(code.data);
                    if (data.amount && data.shopId) {
                        scannedData = data;
                        els.scannedAmount.textContent = `¥ ${parseInt(data.amount).toLocaleString()}`;
                        els.readDisplay.classList.remove('hidden');
                        stopCamera(); return;
                    }
                } catch(e){}
            }
        }
        if (videoStream) requestAnimId = requestAnimationFrame(tick);
    }

    function stopCamera() {
        if (requestAnimId) cancelAnimationFrame(requestAnimId);
        videoStream?.getTracks().forEach(t => t.stop());
        videoStream = null;
    }

    // --- 支払い (★2秒後自動スキャン) ---
    els.confirmPay.onclick = () => {
        const amt = parseInt(scannedData.amount);
        if (balance < amt) return alert('残高不足');
        balance -= amt;
        transactions.push({ type: 'payment', amount: amt, timestamp: new Date().toISOString() });
        localStorage.setItem('customerBalance', balance);
        localStorage.setItem('customerTransactions', JSON.stringify(transactions));
        
        if (window.database && scannedData.transactionId) {
            window.database.ref('payment_status/' + scannedData.transactionId).set({
                status: 'completed', userId: myId, timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        }
        updateUI();
        document.getElementById('completedAmount').textContent = `¥ ${amt.toLocaleString()}`;
        show(els.paymentComp);
        
        timer = setTimeout(() => {
            scannedData = null;
            startScan();
        }, 2000);
    };

    // --- チャージ ---
    document.getElementById('confirmChargeBtn').onclick = () => {
        const amt = parseInt(document.getElementById('chargeAmountInput').value);
        if (!amt || amt <= 0) return;
        balance += amt;
        transactions.push({ type: 'charge', amount: amt, timestamp: new Date().toISOString() });
        localStorage.setItem('customerBalance', balance);
        localStorage.setItem('customerTransactions', JSON.stringify(transactions));
        updateUI();
        document.getElementById('chargedAmount').textContent = `¥ ${amt.toLocaleString()}`;
        show(els.chargeComp);
        timer = setTimeout(() => show(els.main), 3000);
    };

    // --- イベント ---
    document.getElementById('showQrReaderBtn').onclick = startScan;
    document.getElementById('cancelQrReadBtn').onclick = () => { stopCamera(); show(els.main); };
    document.getElementById('showChargeBtn').onclick = () => show(els.chargeSection);
    document.getElementById('cancelChargeBtn').onclick = () => show(els.main);
    document.getElementById('backToMainFromCompletionBtn').onclick = () => show(els.main);
    document.getElementById('showReceiveBtn').onclick = () => {
        show(els.receiveQr);
        document.getElementById('receiveQrCode').innerHTML = '';
        new QRCode(document.getElementById('receiveQrCode'), { text: JSON.stringify({type:'receive_money', userId:myId}), width:200, height:200 });
    };
    document.getElementById('closeReceiveBtn').onclick = () => show(els.main);

    // --- 受取監視 ---
    window.database.ref('remittances/' + myId).on('child_added', (snap) => {
        const amt = parseInt(snap.val().amount);
        balance += amt;
        transactions.push({ type: 'charge', amount: amt, timestamp: new Date().toISOString() });
        localStorage.setItem('customerBalance', balance);
        localStorage.setItem('customerTransactions', JSON.stringify(transactions));
        updateUI();
        document.getElementById('receivedAmountDisplay').textContent = `¥ ${amt.toLocaleString()}`;
        show(els.receiveComp);
        snap.ref.remove();
        timer = setTimeout(() => show(els.main), 3000);
    });

    updateUI();
});
