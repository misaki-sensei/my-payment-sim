document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素 (一番最初のコードと同じ構成) ---
    const currentBalanceEl = document.getElementById('currentBalance');
    const transactionHistoryEl = document.getElementById('transactionHistory');
    const mainPaymentSection = document.getElementById('mainPaymentSection');
    const qrReaderSection = document.getElementById('qrReaderSection');
    const qrCameraVideo = document.getElementById('qrCameraVideo');
    const qrCanvas = document.getElementById('qrCanvas');
    const scannedAmountEl = document.getElementById('scannedAmount');
    const readAmountDisplay = document.getElementById('readAmountDisplay');
    const confirmPayBtn = document.getElementById('confirmPayBtn');
    
    const chargeSection = document.getElementById('chargeSection');
    const chargeAmountInput = document.getElementById('chargeAmountInput');
    const predictedBalanceEl = document.getElementById('predictedBalance');
    const confirmChargeBtn = document.getElementById('confirmChargeBtn');
    const cancelChargeBtn = document.getElementById('cancelChargeBtn');

    const receiveQrSection = document.getElementById('receiveQrSection');
    const receiveQrCodeEl = document.getElementById('receiveQrCode');
    const paymentCompletionSection = document.getElementById('paymentCompletionSection');
    const receiveCompletionSection = document.getElementById('receiveCompletionSection');

    // --- 定数 (一番最初のコードから復元) ---
    const DAILY_CHARGE_LIMIT = 100000;
    const MAX_TOTAL_BALANCE = 100000000;

    // --- 変数 ---
    let balance = parseFloat(localStorage.getItem('customerBalance')) || 0;
    let transactions = JSON.parse(localStorage.getItem('customerTransactions')) || [];
    let dailyCharges = JSON.parse(localStorage.getItem('customerDailyCharges')) || [];
    let videoStream = null;
    let requestAnimFrameId = null;
    let scannedData = null;
    let autoCloseTimer = null;
    let myCustomerId = localStorage.getItem('customerMockPayPayId') || `CUST-${Math.floor(Math.random() * 900000) + 100000}`;
    localStorage.setItem('customerMockPayPayId', myCustomerId);

    // チャージ制限用: 今日の履歴のみ保持
    const today = new Date().toDateString();
    dailyCharges = dailyCharges.filter(c => new Date(c.timestamp).toDateString() === today);

    // --- 画面管理ロジック ---
    function showSection(target) {
        if (autoCloseTimer) clearTimeout(autoCloseTimer);
        [mainPaymentSection, qrReaderSection, receiveQrSection, chargeSection, 
         paymentCompletionSection, receiveCompletionSection].forEach(s => s?.classList.add('hidden'));
        target?.classList.remove('hidden');

        // メイン画面に戻った際にスキャン情報をリセット (連続支払いをスムーズにするため)
        if (target === mainPaymentSection) {
            scannedData = null;
            readAmountDisplay?.classList.add('hidden');
            confirmPayBtn?.classList.add('hidden');
            chargeAmountInput.value = '';
        }
    }

    function updateDisplay() {
        currentBalanceEl.textContent = `¥ ${balance.toLocaleString()}`;
        transactionHistoryEl.innerHTML = transactions.slice().reverse().map(t => 
            `<li><span>${t.type==='payment'?'支払い':'チャージ・受取'}</span><span>¥ ${t.amount.toLocaleString()}</span></li>`).join('');
    }

    // --- カメラ機能 (一番最初のシンプル版) ---
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
            const code = jsQR(ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height).data, qrCanvas.width, qrCanvas.height);
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
        videoStream?.getTracks().forEach(t => t.stop());
        videoStream = null;
    }

    // --- チャージ実行 (一番最初のコードのロジック) ---
    confirmChargeBtn.addEventListener('click', () => {
        const amount = parseInt(chargeAmountInput.value);
        if (!amount || amount <= 0) return alert('金額を入力してください');
        const currentDailyTotal = dailyCharges.reduce((sum, c) => sum + c.amount, 0);
        if (currentDailyTotal + amount > DAILY_CHARGE_LIMIT) return alert('1日のチャージ上限を超えています');
        if (balance + amount > MAX_TOTAL_BALANCE) return alert('残高上限を超えます');

        balance += amount;
        const now = new Date().toISOString();
        transactions.push({ type: 'charge', amount, timestamp: now });
        dailyCharges.push({ amount, timestamp: now });
        localStorage.setItem('customerBalance', balance);
        localStorage.setItem('customerTransactions', JSON.stringify(transactions));
        localStorage.setItem('customerDailyCharges', JSON.stringify(dailyCharges));
        updateDisplay();
        showSection(mainPaymentSection);
    });

    // --- 支払い確定 ---
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

    // --- 各種ボタンイベント ---
    document.getElementById('showQrReaderBtn').addEventListener('click', startQrReader);
    document.getElementById('cancelQrReadBtn').addEventListener('click', () => { stopCamera(); showSection(mainPaymentSection); });
    document.getElementById('showChargeBtn').addEventListener('click', () => { showSection(chargeSection); predictedBalanceEl.textContent = balance.toLocaleString(); });
    document.getElementById('cancelChargeBtn').addEventListener('click', () => showSection(mainPaymentSection));
    document.getElementById('backToMainFromCompletionBtn').addEventListener('click', () => showSection(mainPaymentSection));
    
    document.getElementById('showReceiveBtn').addEventListener('click', () => {
        showSection(receiveQrSection);
        receiveQrCodeEl.innerHTML = '';
        new QRCode(receiveQrCodeEl, { text: JSON.stringify({ type: 'receive_money', userId: myCustomerId }), width: 200, height: 200 });
    });
    document.getElementById('closeReceiveBtn').addEventListener('click', () => showSection(mainPaymentSection));
    document.getElementById('backToMainFromReceiveBtn').addEventListener('click', () => showSection(mainPaymentSection));

    chargeAmountInput.addEventListener('input', () => {
        const val = parseInt(chargeAmountInput.value) || 0;
        predictedBalanceEl.textContent = (balance + val).toLocaleString();
    });

    // --- お金を受け取った時の処理 (3秒自動クローズ) ---
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
        // ここで3秒タイマー
        autoCloseTimer = setTimeout(() => showSection(mainPaymentSection), 3000);
    });

    updateDisplay();
});
