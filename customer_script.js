document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素 ---
    const currentBalanceEl = document.getElementById('currentBalance');
    const transactionHistoryEl = document.getElementById('transactionHistory');
    const mainPaymentSection = document.getElementById('mainPaymentSection');
    const qrReaderSection = document.getElementById('qrReaderSection');
    const qrCameraVideo = document.getElementById('qrCameraVideo');
    const qrCanvas = document.getElementById('qrCanvas');
    const confirmPayBtn = document.getElementById('confirmPayBtn');
    const paymentCompletionSection = document.getElementById('paymentCompletionSection');
    const completedAmountEl = document.getElementById('completedAmount');
    const completedShopIdEl = document.getElementById('completedShopId');

    // --- 定数・変数 ---
    const STORAGE_BALANCE = 'customerMockPayPayBalance';
    const STORAGE_TX = 'customerMockPayPayTransactions';
    const AUTO_DELAY = 2000;

    let balance = parseFloat(localStorage.getItem(STORAGE_BALANCE)) || 0;
    let transactions = JSON.parse(localStorage.getItem(STORAGE_TX)) || [];
    let scannedData = null;
    let videoStream = null;
    let myCustomerId = localStorage.getItem('customerMockPayPayId') || `CUST-${Math.floor(Math.random()*900000)+100000}`;
    localStorage.setItem('customerMockPayPayId', myCustomerId);

    const updateDisplay = () => {
        currentBalanceEl.textContent = `¥ ${balance.toLocaleString()}`;
        transactionHistoryEl.innerHTML = transactions.slice().reverse().map(t => 
            `<li>${t.type==='payment'?'支払い':'チャージ'}: ¥${t.amount.toLocaleString()}<br><small>${new Date(t.timestamp).toLocaleString()}</small></li>`
        ).join('');
    };

    const showSection = (target) => {
        [mainPaymentSection, qrReaderSection, paymentCompletionSection].forEach(s => s?.classList.add('hidden'));
        target?.classList.remove('hidden');
    };

    // --- QRスキャン ---
    window.startQrReader = () => {
        showSection(qrReaderSection);
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
            videoStream = stream; qrCameraVideo.srcObject = stream; qrCameraVideo.play();
            requestAnimationFrame(tick);
        });
    };

    function tick() {
        if (qrCameraVideo.readyState === qrCameraVideo.HAVE_ENOUGH_DATA) {
            qrCanvas.width = qrCameraVideo.videoWidth; qrCanvas.height = qrCameraVideo.videoHeight;
            const ctx = qrCanvas.getContext('2d');
            ctx.drawImage(qrCameraVideo, 0, 0, qrCanvas.width, qrCanvas.height);
            const code = jsQR(ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height).data, qrCanvas.width, qrCanvas.height);
            if (code) {
                scannedData = JSON.parse(code.data);
                stopCamera();
                confirmPayBtn.classList.remove('hidden');
                return;
            }
        }
        if (videoStream) requestAnimationFrame(tick);
    }

    function stopCamera() {
        videoStream?.getTracks().forEach(t => t.stop()); videoStream = null;
    }

    // --- 支払い実行（IDを返送） ---
    confirmPayBtn.onclick = async () => {
        const amount = parseInt(scannedData.amount);
        if (balance < amount) return alert("残高不足");

        try {
            const now = new Date().toISOString();
            // GAS連携用パス
            await window.database.ref('paymentStatuses').push({
                amount: amount,
                shopId: scannedData.shopId,
                customerId: myCustomerId,
                timestamp: now,
                transactionId: scannedData.transactionId // お店に照合させるID
            });

            balance -= amount;
            localStorage.setItem(STORAGE_BALANCE, balance);
            transactions.push({ type: 'payment', amount, timestamp: now });
            localStorage.setItem(STORAGE_TX, JSON.stringify(transactions));

            updateDisplay();
            completedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
            completedShopIdEl.textContent = scannedData.shopId;
            showSection(paymentCompletionSection);
            setTimeout(() => { showSection(mainPaymentSection); }, AUTO_DELAY);
        } catch (e) { alert(e.message); }
    };

    updateDisplay();
});
