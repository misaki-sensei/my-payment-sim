document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const currentBalanceEl = document.getElementById('currentBalance');
    const transactionHistoryEl = document.getElementById('transactionHistory');
    const mainPaymentSection = document.getElementById('mainPaymentSection');
    const qrReaderSection = document.getElementById('qrReaderSection');
    const qrCameraVideo = document.getElementById('qrCameraVideo');
    const qrCanvas = document.getElementById('qrCanvas');
    const scannedAmountEl = document.getElementById('scannedAmount');
    const readAmountDisplay = document.getElementById('readAmountDisplay');
    const confirmPayBtn = document.getElementById('confirmPayBtn');
    
    // チャージ関連の要素
    const showChargeBtn = document.getElementById('showChargeBtn');
    const chargeSection = document.getElementById('chargeSection');
    const chargeAmountInput = document.getElementById('chargeAmountInput');
    const predictedBalanceEl = document.getElementById('predictedBalance');
    const confirmChargeBtn = document.getElementById('confirmChargeBtn');
    const cancelChargeBtn = document.getElementById('cancelChargeBtn');

    const receiveQrSection = document.getElementById('receiveQrSection');
    const receiveQrCodeEl = document.getElementById('receiveQrCode');
    const paymentCompletionSection = document.getElementById('paymentCompletionSection');
    const receiveCompletionSection = document.getElementById('receiveCompletionSection');

    // --- 変数管理 ---
    let balance = parseFloat(localStorage.getItem('customerBalance')) || 0;
    let transactions = JSON.parse(localStorage.getItem('customerTransactions')) || [];
    let videoStream = null;
    let requestAnimFrameId = null;
    let scannedData = null;
    let autoCloseTimer = null;
    let myCustomerId = localStorage.getItem('customerMockPayPayId') || `CUST-${Math.floor(Math.random() * 900000) + 100000}`;
    localStorage.setItem('customerMockPayPayId', myCustomerId);

    // --- 画面切り替え & リセット（連続支払い対応） ---
    function showSection(target) {
        if (autoCloseTimer) clearTimeout(autoCloseTimer);
        
        [mainPaymentSection, qrReaderSection, receiveQrSection, 
         chargeSection, paymentCompletionSection, receiveCompletionSection].forEach(s => {
            if(s) s.classList.add('hidden');
        });
        
        if (target) target.classList.remove('hidden');

        // メイン画面に戻る際、データをリセット
        if (target === mainPaymentSection) {
            scannedData = null;
            if(readAmountDisplay) readAmountDisplay.classList.add('hidden');
            if(confirmPayBtn) confirmPayBtn.classList.add('hidden');
            chargeAmountInput.value = '';
            updatePredictedBalance();
        }
    }

    function updateDisplay() {
        currentBalanceEl.textContent = `¥ ${balance.toLocaleString()}`;
        transactionHistoryEl.innerHTML = transactions.slice().reverse().map(t => 
            `<li><span>${t.type==='payment'?'支払い':'受取・チャージ'}</span><span>¥ ${t.amount.toLocaleString()}</span></li>`).join('');
    }

    function updatePredictedBalance() {
        const val = parseInt(chargeAmountInput.value) || 0;
        predictedBalanceEl.textContent = (balance + val).toLocaleString();
    }

    // --- カメラ機能 (シンプル版) ---
    function startQrReader() {
        showSection(qrReaderSection);
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
            videoStream = stream;
            qrCameraVideo.srcObject = stream;
            qrCameraVideo.play();
            requestAnimFrameId = requestAnimationFrame(tick);
        }).catch(err => {
            alert("カメラを起動できませんでした: " + err.message);
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

    // --- 各種ボタンイベント ---

    // 支払いスキャン開始
    document.getElementById('showQrReaderBtn').addEventListener('click', startQrReader);

    // チャージ画面を開く（ここが原因だった可能性があります）
    showChargeBtn.addEventListener('click', () => {
        showSection(chargeSection);
        updatePredictedBalance();
    });

    // チャージ実行
    confirmChargeBtn.addEventListener('click', () => {
        const amount = parseInt(chargeAmountInput.value);
        if (!amount || amount <= 0) return alert('金額を入力してください');
        
        balance += amount;
        transactions.push({ type: 'charge', amount, timestamp: new Date().toISOString() });
        localStorage.setItem('customerBalance', balance);
        localStorage.setItem('customerTransactions', JSON.stringify(transactions));
        
        updateDisplay();
        alert('チャージが完了しました');
        showSection(mainPaymentSection);
    });

    // 支払い確定
    confirmPayBtn.addEventListener('click', () => {
        const amount = parseInt(scannedData.amount);
        if (balance < amount) return alert('残高不足');
        
        balance -= amount;
        transactions.push({ type: 'payment', amount, timestamp: new Date().toISOString() });
        localStorage.setItem('customerBalance', balance);
        localStorage.setItem('customerTransactions', JSON.stringify(transactions));

        if (window.database && scannedData.transactionId) {
            window.database.ref('payment_status/' + scannedData.transactionId).set({
                status: 'completed', userId: myCustomerId, timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        }

        updateDisplay();
        document.getElementById('completedAmount').textContent = `¥ ${amount.toLocaleString()}`;
        showSection(paymentCompletionSection);
    });

    // キャンセル・戻るボタン
    cancelQrReadBtn.addEventListener('click', () => { stopCamera(); showSection(mainPaymentSection); });
    cancelChargeBtn.addEventListener('click', () => showSection(mainPaymentSection));
    document.getElementById('backToMainFromCompletionBtn').addEventListener('click', () => showSection(mainPaymentSection));
    
    // お金を受け取るQR表示
    document.getElementById('showReceiveBtn').addEventListener('click', () => {
        showSection(receiveQrSection);
        receiveQrCodeEl.innerHTML = '';
        new QRCode(receiveQrCodeEl, { text: JSON.stringify({ type: 'receive_money', userId: myCustomerId }), width: 200, height: 200 });
    });
    document.getElementById('closeReceiveBtn').addEventListener('click', () => showSection(mainPaymentSection));
    document.getElementById('backToMainFromReceiveBtn').addEventListener('click', () => showSection(mainPaymentSection));

    // チャージ金額入力時の予測計算
    chargeAmountInput.addEventListener('input', updatePredictedBalance);

    // --- 送金受取監視 (3秒自動クローズ) ---
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

        autoCloseTimer = setTimeout(() => showSection(mainPaymentSection), 3000);
    });

    updateDisplay();
});
