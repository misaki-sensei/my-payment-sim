document.addEventListener('DOMContentLoaded', () => {
    // 要素取得
    const currentBalanceEl = document.getElementById('currentBalance');
    const transactionHistoryEl = document.getElementById('transactionHistory');
    const mainPaymentSection = document.getElementById('mainPaymentSection');
    const qrReaderSection = document.getElementById('qrReaderSection');
    const qrCameraVideo = document.getElementById('qrCameraVideo');
    const qrCanvas = document.getElementById('qrCanvas');
    const cameraStatus = document.getElementById('cameraStatus');
    const scannedAmountEl = document.getElementById('scannedAmount');
    const readAmountDisplay = document.getElementById('readAmountDisplay');
    const confirmPayBtn = document.getElementById('confirmPayBtn');
    
    const receiveQrSection = document.getElementById('receiveQrSection');
    const receiveQrCodeEl = document.getElementById('receiveQrCode');
    const paymentCompletionSection = document.getElementById('paymentCompletionSection');
    const receiveCompletionSection = document.getElementById('receiveCompletionSection');

    // 変数
    let balance = parseFloat(localStorage.getItem('customerBalance')) || 0;
    let transactions = JSON.parse(localStorage.getItem('customerTransactions')) || [];
    let videoStream = null;
    let requestAnimFrameId = null;
    let scannedData = null;
    let autoCloseTimer = null;
    let myCustomerId = localStorage.getItem('customerMockPayPayId') || `CUST-${Math.floor(Math.random() * 900000) + 100000}`;
    localStorage.setItem('customerMockPayPayId', myCustomerId);

    // 画面切り替え & リセット（連続支払い対応）
    function showSection(target) {
        if (autoCloseTimer) clearTimeout(autoCloseTimer);
        
        [mainPaymentSection, qrReaderSection, receiveQrSection, 
         document.getElementById('chargeSection'), paymentCompletionSection, receiveCompletionSection].forEach(s => {
            if(s) s.classList.add('hidden');
        });
        
        if (target) target.classList.remove('hidden');

        // メイン画面に戻る際に、スキャンデータをリセットして連続支払いを可能にする
        if (target === mainPaymentSection) {
            scannedData = null;
            readAmountDisplay.classList.add('hidden');
            confirmPayBtn.classList.add('hidden');
        }
    }

    function updateDisplay() {
        currentBalanceEl.textContent = `¥ ${balance.toLocaleString()}`;
        transactionHistoryEl.innerHTML = transactions.slice().reverse().map(t => 
            `<li><span>${t.type==='payment'?'支払い':'受取'}</span><span>¥ ${t.amount.toLocaleString()}</span></li>`).join('');
    }

    // --- カメラ機能 (シンプル版) ---
    function startQrReader() {
        showSection(qrReaderSection);
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
            videoStream = stream;
            qrCameraVideo.srcObject = stream;
            qrCameraVideo.play();
            requestAnimFrameId = requestAnimationFrame(tick);
        });
    }

    function tick() {
        if (qrCameraVideo.readyState === qrCameraVideo.HAVE_ENOUGH_DATA) {
            qrCanvas.width = qrCameraVideo.videoWidth;
            qrCanvas.height = qrCameraVideo.videoHeight;
            const ctx = qrCanvas.getContext('2d');
            ctx.drawImage(qrCameraVideo, 0, 0);
            const imageData = ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code) {
                try {
                    const data = JSON.parse(code.data);
                    if (data.amount && data.shopId) {
                        scannedData = data;
                        scannedAmountEl.textContent = `¥ ${parseInt(data.amount).toLocaleString()}`;
                        readAmountDisplay.classList.remove('hidden');
                        confirmPayBtn.classList.remove('hidden');
                        stopCamera();
                        return;
                    }
                } catch(e) {}
            }
        }
        if (videoStream) requestAnimFrameId = requestAnimationFrame(tick);
    }

    function stopCamera() {
        if (requestAnimFrameId) cancelAnimationFrame(requestAnimFrameId);
        if (videoStream) videoStream.getTracks().forEach(t => t.stop());
        videoStream = null;
    }

    // --- 支払い確定 ---
    confirmPayBtn.addEventListener('click', () => {
        const amount = parseInt(scannedData.amount);
        if (balance < amount) return alert('残高不足');
        
        balance -= amount;
        transactions.push({ type: 'payment', amount, timestamp: new Date().toISOString() });
        localStorage.setItem('customerBalance', balance);
        localStorage.setItem('customerTransactions', JSON.stringify(transactions));

        // Firebase通知
        if (window.database && scannedData.transactionId) {
            window.database.ref('payment_status/' + scannedData.transactionId).set({
                status: 'completed', userId: myCustomerId, timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        }

        updateDisplay();
        document.getElementById('completedAmount').textContent = `¥ ${amount.toLocaleString()}`;
        showSection(paymentCompletionSection);
    });

    // --- イベント ---
    document.getElementById('showQrReaderBtn').addEventListener('click', startQrReader);
    document.getElementById('cancelQrReadBtn').addEventListener('click', () => { stopCamera(); showSection(mainPaymentSection); });
    document.getElementById('backToMainFromCompletionBtn').addEventListener('click', () => showSection(mainPaymentSection));
    document.getElementById('showReceiveBtn').addEventListener('click', () => {
        showSection(receiveQrSection);
        receiveQrCodeEl.innerHTML = '';
        new QRCode(receiveQrCodeEl, { text: JSON.stringify({ type: 'receive_money', userId: myCustomerId }), width: 200, height: 200 });
    });
    document.getElementById('closeReceiveBtn').addEventListener('click', () => showSection(mainPaymentSection));
    document.getElementById('backToMainFromReceiveBtn').addEventListener('click', () => showSection(mainPaymentSection));

    // --- 受取監視 (3秒自動クローズ) ---
    window.database.ref('remittances/' + myCustomerId).on('child_added', (snapshot) => {
        const data = snapshot.val();
        const amount = parseInt(data.amount);
        balance += amount;
        transactions.push({ type: 'charge', amount, timestamp: new Date().toISOString() });
        localStorage.setItem('customerBalance', balance);
        localStorage.setItem('customerTransactions', JSON.stringify(transactions));
        
        updateDisplay();
        document.getElementById('receivedAmountDisplay').textContent = `¥ ${amount.toLocaleString()}`;
        showSection(receiveCompletionSection);
        snapshot.ref.remove();

        // 3秒後に自動で閉じる
        autoCloseTimer = setTimeout(() => showSection(mainPaymentSection), 3000);
    });

    updateDisplay();
});
