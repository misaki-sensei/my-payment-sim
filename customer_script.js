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

    // --- 定数 (一番最初のコードの設定) ---
    const DAILY_CHARGE_LIMIT = 100000;      // 1日10万円
    const MAX_TOTAL_BALANCE = 100000000;   // 残高上限1億円
    const AUTO_CLOSE_DELAY = 3000;         // 3秒

    // --- 変数管理 ---
    let balance = parseFloat(localStorage.getItem('customerBalance')) || 0;
    let transactions = JSON.parse(localStorage.getItem('customerTransactions')) || [];
    let dailyCharges = JSON.parse(localStorage.getItem('customerDailyCharges')) || [];
    
    let videoStream = null;
    let requestAnimFrameId = null;
    let scannedData = null;
    let autoCloseTimer = null;
    let myCustomerId = localStorage.getItem('customerMockPayPayId') || `CUST-${Math.floor(Math.random() * 900000) + 100000}`;
    localStorage.setItem('customerMockPayPayId', myCustomerId);

    // --- 初期化処理 (今日の日付でチャージ履歴をフィルタリング) ---
    function loadAppData() {
        const today = new Date().toDateString();
        dailyCharges = dailyCharges.filter(c => new Date(c.timestamp).toDateString() === today);
        localStorage.setItem('customerDailyCharges', JSON.stringify(dailyCharges));
    }

    // --- 画面切り替え & リセット（連続支払い対応） ---
    function showSection(target) {
        if (autoCloseTimer) clearTimeout(autoCloseTimer);
        
        [mainPaymentSection, qrReaderSection, receiveQrSection, 
         chargeSection, paymentCompletionSection, receiveCompletionSection].forEach(s => {
            if(s) s.classList.add('hidden');
        });
        
        if (target) target.classList.remove('hidden');

        // メイン画面に戻る際、スキャンデータをリセットして連続支払いを可能にする
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
            `<li><span>${t.type==='payment'?'支払い':'チャージ・受取'}</span><span>¥ ${t.amount.toLocaleString()}</span></li>`).join('');
    }

    function updatePredictedBalance() {
        const val = parseInt(chargeAmountInput.value) || 0;
        predictedBalanceEl.textContent = (balance + val).toLocaleString();
    }

    // --- カメラ機能 (シンプル版・安定動作) ---
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

    // --- チャージ実行 (一番最初のコードの制限ロジック) ---
    confirmChargeBtn.addEventListener('click', () => {
        const amount = parseInt(chargeAmountInput.value);
        if (!amount || amount <= 0) return alert('正しい金額を入力してください');

        // 1日10万円制限のチェック
        const currentDailyTotal = dailyCharges.reduce((sum, c) => sum + c.amount, 0);
        if (currentDailyTotal + amount > DAILY_CHARGE_LIMIT) {
            return alert(`1日のチャージ上限は${(DAILY_CHARGE_LIMIT/10000)}万円です。\n本日のチャージ済み: ${currentDailyTotal.toLocaleString()}円`);
        }

        // 残高1億円制限のチェック
        if (balance + amount > MAX_TOTAL_BALANCE) {
            return alert(`残高上限(${(MAX_TOTAL_BALANCE/100000000)}億円)を超えるためチャージできません。`);
        }
        
        balance += amount;
        const now = new Date().toISOString();
        transactions.push({ type: 'charge', amount, timestamp: now });
        dailyCharges.push({ amount: amount, timestamp: now });

        localStorage.setItem('customerBalance', balance);
        localStorage.setItem('customerTransactions', JSON.stringify(transactions));
        localStorage.setItem('customerDailyCharges', JSON.stringify(dailyCharges));
        
        updateDisplay();
        alert('チャージが完了しました');
        showSection(mainPaymentSection);
    });

    // --- 支払い確定 ---
    confirmPayBtn.addEventListener('click', () => {
        const amount = parseInt(scannedData.amount);
        if (balance < amount) return alert('残高不足です');
        
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
        // 支払いは自動で閉じない（手動で戻る）
    });

    // --- イベントリスナー ---
    showChargeBtn.addEventListener('click', () => {
        showSection(chargeSection);
        updatePredictedBalance();
    });

    document.getElementById('showQrReaderBtn').addEventListener('click', startQrReader);
    cancelQrReadBtn.addEventListener('click', () => { stopCamera(); showSection(mainPaymentSection); });
    cancelChargeBtn.addEventListener('click', () => showSection(mainPaymentSection));
    document.getElementById('backToMainFromCompletionBtn').addEventListener('click', () => showSection(mainPaymentSection));
    
    document.getElementById('showReceiveBtn').addEventListener('click', () => {
        showSection(receiveQrSection);
        receiveQrCodeEl.innerHTML = '';
        new QRCode(receiveQrCodeEl, { text: JSON.stringify({ type: 'receive_money', userId: myCustomerId }), width: 200, height: 200 });
    });
    document.getElementById('closeReceiveBtn').addEventListener('click', () => showSection(mainPaymentSection));
    document.getElementById('backToMainFromReceiveBtn').addEventListener('click', () => showSection(mainPaymentSection));

    chargeAmountInput.addEventListener('input', updatePredictedBalance);

    // --- お金を受け取った時の処理 (3秒自動クローズ) ---
    window.database.ref('remittances/' + myCustomerId).on('child_added', (snapshot) => {
        const data = snapshot.val();
        const amount = parseInt(data.amount);
        
        // 受取時も残高上限をチェック
        if (balance + amount <= MAX_TOTAL_BALANCE) {
            balance += amount;
            transactions.push({ type: 'charge', amount, timestamp: new Date().toISOString() });
            localStorage.setItem('customerBalance', balance);
            localStorage.setItem('customerTransactions', JSON.stringify(transactions));
            
            updateDisplay();
            document.getElementById('receivedAmountDisplay').textContent = `¥ ${amount.toLocaleString()}`;
            showSection(receiveCompletionSection);

            // 受取時のみ3秒後に自動で閉じる
            autoCloseTimer = setTimeout(() => showSection(mainPaymentSection), AUTO_CLOSE_DELAY);
        }
        snapshot.ref.remove();
    });

    loadAppData();
    updateDisplay();
});
