document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素 (一番最初のコードのID構成) ---
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
    const chargedAmountEl = document.getElementById('chargedAmount');
    const chargeCompletionSection = document.getElementById('chargeCompletionSection');

    const paymentCompletionSection = document.getElementById('paymentCompletionSection');
    const receiveQrSection = document.getElementById('receiveQrSection'); // 送金受取用
    const receiveQrCodeEl = document.getElementById('receiveQrCode');

    // --- 定数 (一番最初のコードから復元) ---
    const DAILY_CHARGE_LIMIT = 100000;
    const MAX_TOTAL_BALANCE = 100000000;
    const AUTO_CLOSE_DELAY = 3000; // 3秒

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

    const today = new Date().toDateString();
    dailyCharges = dailyCharges.filter(c => new Date(c.timestamp).toDateString() === today);

    // --- 画面管理 ---
    function showSection(target) {
        if (autoCloseTimer) clearTimeout(autoCloseTimer);
        [mainPaymentSection, qrReaderSection, chargeSection, 
         paymentCompletionSection, chargeCompletionSection, 
         receiveQrSection, document.getElementById('receiveCompletionSection')].forEach(s => s?.classList.add('hidden'));
        
        target?.classList.remove('hidden');

        // メインに戻った時に変数をリセット (連続支払い対応)
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
            `<li class="${t.type}"><span>${t.type==='payment'?'支払い':'チャージ・受取'}</span><span>¥ ${t.amount.toLocaleString()}</span></li>`).join('');
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

    // --- チャージ処理 (3秒自動クローズ付き) ---
    confirmChargeBtn.addEventListener('click', () => {
        let amount = parseInt(chargeAmountInput.value);
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
        
        // チャージ完了画面を表示し、3秒後に戻る
        chargedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
        showSection(chargeCompletionSection);
        autoCloseTimer = setTimeout(() => showSection(mainPaymentSection), AUTO_CLOSE_DELAY);
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
        // 支払いは自動で閉じない（元の仕様通り）
    });

    // --- ボタンイベント ---
    document.getElementById('showQrReaderBtn').addEventListener('click', startQrReader);
    document.getElementById('cancelQrReadBtn').addEventListener('click', () => { stopCamera(); showSection(mainPaymentSection); });
    document.getElementById('showChargeBtn').addEventListener('click', () => showSection(chargeSection));
    document.getElementById('cancelChargeBtn').addEventListener('click', () => showSection(mainPaymentSection));
    document.getElementById('backToMainFromCompletionBtn').addEventListener('click', () => showSection(mainPaymentSection));
    document.getElementById('backToMainFromChargeCompletionBtn').addEventListener('click', () => showSection(mainPaymentSection));
    
    // 送金受取用
    document.getElementById('showReceiveBtn').addEventListener('click', () => {
        showSection(receiveQrSection);
        receiveQrCodeEl.innerHTML = '';
        new QRCode(receiveQrCodeEl, { text: JSON.stringify({ type: 'receive_money', userId: myCustomerId }), width: 200, height: 200 });
    });

    chargeAmountInput.addEventListener('input', () => {
        const val = parseInt(chargeAmountInput.value) || 0;
        predictedBalanceEl.textContent = (balance + val).toLocaleString();
    });

    // --- 送金受取 (3秒自動クローズ) ---
    window.database.ref('remittances/' + myCustomerId).on('child_added', (snapshot) => {
        const data = snapshot.val();
        const amount = parseInt(data.amount);
        balance += amount;
        transactions.push({ type: 'charge', amount, timestamp: new Date().toISOString() });
        localStorage.setItem('customerBalance', balance);
        localStorage.setItem('customerTransactions', JSON.stringify(transactions));
        
        updateDisplay();
        const receiveCompletion = document.getElementById('receiveCompletionSection');
        document.getElementById('receivedAmountDisplay').textContent = `¥ ${amount.toLocaleString()}`;
        showSection(receiveCompletion);
        snapshot.ref.remove();

        autoCloseTimer = setTimeout(() => showSection(mainPaymentSection), AUTO_CLOSE_DELAY);
    });

    updateDisplay();
});
