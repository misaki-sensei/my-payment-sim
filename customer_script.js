document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const els = {
        currentBalance: document.getElementById('currentBalance'),
        transactionHistory: document.getElementById('transactionHistory'),
        mainSection: document.getElementById('mainPaymentSection'),
        qrReaderSection: document.getElementById('qrReaderSection'),
        qrVideo: document.getElementById('qrCameraVideo'),
        qrCanvas: document.getElementById('qrCanvas'),
        readDisplay: document.getElementById('readAmountDisplay'),
        scannedAmount: document.getElementById('scannedAmount'),
        confirmPayBtn: document.getElementById('confirmPayBtn'),
        chargeSection: document.getElementById('chargeSection'),
        chargeInput: document.getElementById('chargeAmountInput'),
        predictedBalance: document.getElementById('predictedBalance'),
        receiveQrSection: document.getElementById('receiveQrSection'),
        receiveQrCode: document.getElementById('receiveQrCode'),
        // 完了画面
        paymentComp: document.getElementById('paymentCompletionSection'),
        chargeComp: document.getElementById('chargeCompletionSection'),
        receiveComp: document.getElementById('receiveCompletionSection'),
        // 金額表示用
        completedAmount: document.getElementById('completedAmount'),
        chargedAmount: document.getElementById('chargedAmount'),
        receivedAmountDisplay: document.getElementById('receivedAmountDisplay')
    };

    // --- 変数管理 ---
    let balance = parseFloat(localStorage.getItem('customerBalance')) || 0;
    let transactions = JSON.parse(localStorage.getItem('customerTransactions')) || [];
    let videoStream = null;
    let requestAnimId = null;
    let scannedData = null;
    let autoTimer = null; // 自動遷移用タイマー
    const myId = localStorage.getItem('customerMockPayPayId') || `CUST-${Math.floor(Math.random()*900000)+100000}`;
    localStorage.setItem('customerMockPayPayId', myId);

    // --- 共通機能 ---
    function showSection(target) {
        if (autoTimer) clearTimeout(autoTimer); // タイマーがあれば解除
        // 全セクションを隠す
        [els.mainSection, els.qrReaderSection, els.chargeSection, els.receiveQrSection, 
         els.paymentComp, els.chargeComp, els.receiveComp].forEach(s => s?.classList.add('hidden'));
        // 対象を表示
        target?.classList.remove('hidden');
    }

    function updateUI() {
        els.currentBalance.textContent = `¥ ${balance.toLocaleString()}`;
        els.transactionHistory.innerHTML = transactions.slice().reverse().map(t => 
            `<li><span>${t.type==='payment'?'支払い':'入金'}</span><span>¥ ${t.amount.toLocaleString()}</span></li>`
        ).join('');
    }

    // --- カメラ機能 (スキャン) ---
    function startScan() {
        showSection(els.qrReaderSection);
        els.readDisplay.classList.add('hidden');
        els.confirmPayBtn.classList.add('hidden');
        
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
            videoStream = stream;
            els.qrVideo.srcObject = stream;
            els.qrVideo.play();
            requestAnimId = requestAnimationFrame(tick);
        }).catch(err => alert("カメラを起動できません: " + err));
    }

    function tick() {
        if (els.qrVideo.readyState === els.qrVideo.HAVE_ENOUGH_DATA) {
            els.qrCanvas.width = els.qrVideo.videoWidth;
            els.qrCanvas.height = els.qrVideo.videoHeight;
            const ctx = els.qrCanvas.getContext('2d');
            ctx.drawImage(els.qrVideo, 0, 0);
            const code = jsQR(ctx.getImageData(0,0,els.qrCanvas.width,els.qrCanvas.height).data, els.qrCanvas.width, els.qrCanvas.height);
            
            if (code) {
                try {
                    const data = JSON.parse(code.data);
                    if (data.amount && data.shopId) {
                        scannedData = data;
                        els.scannedAmount.textContent = `¥ ${parseInt(data.amount).toLocaleString()}`;
                        els.readDisplay.classList.remove('hidden');
                        els.confirmPayBtn.classList.remove('hidden');
                        stopCamera();
                        return;
                    }
                } catch(e) {}
            }
        }
        if (videoStream) requestAnimId = requestAnimationFrame(tick);
    }

    function stopCamera() {
        if (requestAnimId) cancelAnimationFrame(requestAnimId);
        videoStream?.getTracks().forEach(t => t.stop());
        videoStream = null;
    }

    // --- 1. 支払い確定 (★2秒後に自動でカメラへ戻る) ---
    els.confirmPayBtn.onclick = () => {
        const amt = parseInt(scannedData.amount);
        if (balance < amt) return alert('残高不足です');
        
        balance -= amt;
        transactions.push({ type: 'payment', amount: amt, timestamp: new Date().toISOString() });
        localStorage.setItem('customerBalance', balance);
        localStorage.setItem('customerTransactions', JSON.stringify(transactions));
        
        // Firebaseへ完了通知
        if (window.database && scannedData.transactionId) {
            window.database.ref('payment_status/' + scannedData.transactionId).set({
                status: 'completed', userId: myId, timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        }
        
        updateUI();
        els.completedAmount.textContent = `¥ ${amt.toLocaleString()}`;
        showSection(els.paymentComp);
        
        // ★2秒後に自動でスキャン画面に戻る (連続支払い)
        autoTimer = setTimeout(() => {
            scannedData = null;
            startScan();
        }, 2000);
    };

    // --- 2. チャージ実行 (★3秒後にメインへ戻る) ---
    document.getElementById('confirmChargeBtn').onclick = () => {
        const amt = parseInt(els.chargeInput.value);
        if (!amt || amt <= 0) return alert('金額を入力してください');
        
        balance += amt;
        transactions.push({ type: 'charge', amount: amt, timestamp: new Date().toISOString() });
        localStorage.setItem('customerBalance', balance);
        localStorage.setItem('customerTransactions', JSON.stringify(transactions));
        
        updateUI();
        els.chargedAmount.textContent = `¥ ${amt.toLocaleString()}`;
        showSection(els.chargeComp);
        
        // ★3秒後にメイン画面に戻る
        autoTimer = setTimeout(() => showSection(els.mainSection), 3000);
    };

    // --- 各種ボタンイベント ---
    document.getElementById('showQrReaderBtn').onclick = startScan;
    document.getElementById('cancelQrReadBtn').onclick = () => { stopCamera(); showSection(els.mainSection); };
    document.getElementById('showChargeBtn').onclick = () => {
        els.chargeInput.value = '';
        els.predictedBalance.textContent = balance.toLocaleString();
        showSection(els.chargeSection);
    };
    document.getElementById('cancelChargeBtn').onclick = () => showSection(els.mainSection);
    document.getElementById('backToMainFromCompletionBtn').onclick = () => showSection(els.mainSection);
    document.getElementById('backToMainFromChargeCompletionBtn').onclick = () => showSection(els.mainSection);
    document.getElementById('backToMainFromReceiveBtn').onclick = () => showSection(els.mainSection);
    
    // お金を受け取る(QR表示)
    document.getElementById('showReceiveBtn').onclick = () => {
        showSection(els.receiveQrSection);
        els.receiveQrCode.innerHTML = '';
        new QRCode(els.receiveQrCode, { text: JSON.stringify({type:'receive_money', userId:myId}), width:200, height:200 });
    };
    document.getElementById('closeReceiveBtn').onclick = () => showSection(els.mainSection);

    // チャージ額入力時の予測表示
    els.chargeInput.oninput = () => {
        const val = parseInt(els.chargeInput.value) || 0;
        els.predictedBalance.textContent = (balance + val).toLocaleString();
    };

    // --- 3. 受取監視 (★3秒後にメインへ戻る) ---
    window.database.ref('remittances/' + myId).on('child_added', (snap) => {
        const data = snap.val();
        const amt = parseInt(data.amount);
        balance += amt;
        transactions.push({ type: 'charge', amount: amt, timestamp: new Date().toISOString() });
        localStorage.setItem('customerBalance', balance);
        localStorage.setItem('customerTransactions', JSON.stringify(transactions));
        
        updateUI();
        els.receivedAmountDisplay.textContent = `¥ ${amt.toLocaleString()}`;
        showSection(els.receiveComp);
        
        snap.ref.remove(); // データを削除
        
        // ★3秒後にメイン画面に戻る
        autoTimer = setTimeout(() => showSection(els.mainSection), 3000);
    });

    updateUI();
});
