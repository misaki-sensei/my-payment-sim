document.addEventListener('DOMContentLoaded', () => {
    // --- 定数・初期設定 ---
    const LOCAL_STORAGE_BALANCE_KEY = 'posipay_balance';
    const LOCAL_STORAGE_TRANSACTIONS_KEY = 'posipay_transactions';
    const LOCAL_STORAGE_USER_ID_KEY = 'posipay_user_id';
    const MAX_BALANCE = 1000000;

    let balance = parseInt(localStorage.getItem(LOCAL_STORAGE_BALANCE_KEY)) || 0;
    let transactions = JSON.parse(localStorage.getItem(LOCAL_STORAGE_TRANSACTIONS_KEY)) || [];
    let myCustomerId = localStorage.getItem(LOCAL_STORAGE_USER_ID_KEY);

    if (!myCustomerId) {
        myCustomerId = 'USR-' + Math.random().toString(36).substring(2, 9).toUpperCase();
        localStorage.setItem(LOCAL_STORAGE_USER_ID_KEY, myCustomerId);
    }

    // --- DOM要素 ---
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
    const paymentCompletionSection = document.getElementById('paymentCompletionSection');
    const chargeCompletionSection = document.getElementById('chargeCompletionSection');
    const receiveCompletionSection = document.getElementById('receiveCompletionSection');
    const receiveQrSection = document.getElementById('receiveQrSection');

    let videoStream = null;
    let animationFrameId = null;
    let currentScanData = null;

    // --- 初期表示 ---
    document.getElementById('myIdDisplay').textContent = `あなたのID: ${myCustomerId}`;
    updateBalanceDisplay();
    updateHistoryDisplay();

    // --- 基本関数 ---
    function updateBalanceDisplay() {
        currentBalanceEl.textContent = `¥ ${balance.toLocaleString()}`;
    }

    function showSection(section) {
        [mainPaymentSection, qrReaderSection, chargeSection, paymentCompletionSection, 
         chargeCompletionSection, receiveQrSection, receiveCompletionSection].forEach(s => s.classList.add('hidden'));
        section.classList.remove('hidden');
    }

    function updateHistoryDisplay() {
        transactionHistoryEl.innerHTML = '';
        transactions.slice().reverse().forEach(t => {
            const li = document.createElement('li');
            li.className = t.type;
            const date = new Date(t.timestamp).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            li.innerHTML = `<span>${t.type === 'payment' ? '-' : '+'} ¥${t.amount.toLocaleString()}</span><span class="history-date">${date}</span>`;
            transactionHistoryEl.appendChild(li);
        });
    }

    // --- チャージ処理 ---
    const updatePredictedBalance = () => {
        let inputVal = parseInt(chargeAmountInput.value) || 0;
        if (inputVal > MAX_BALANCE) {
            chargeAmountInput.value = MAX_BALANCE;
            inputVal = MAX_BALANCE;
        }
        const predicted = Math.min(balance + inputVal, MAX_BALANCE);
        document.getElementById('newBalanceText').textContent = `¥ ${predicted.toLocaleString()}`;
    };

    async function handleCharge() {
        const amount = parseInt(chargeAmountInput.value);
        if (!amount || amount <= 0) return;
        if (balance + amount > MAX_BALANCE) return alert("残高上限は100万円です");

        balance += amount;
        localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, balance);
        transactions.push({ type: 'charge', amount, timestamp: new Date().toISOString() });
        localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));

        document.getElementById('chargedAmount').textContent = `¥ ${amount.toLocaleString()}`;
        updateBalanceDisplay();
        updateHistoryDisplay();
        showSection(chargeCompletionSection);
    }

    // --- QRコード読み取り (支払い) ---
    async function startQrReader() {
        showSection(qrReaderSection);
        readAmountDisplay.classList.add('hidden');
        confirmPayBtn.classList.add('hidden');
        currentScanData = null;

        try {
            videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            qrCameraVideo.srcObject = videoStream;
            qrCameraVideo.setAttribute("playsinline", true);
            qrCameraVideo.play();
            animationFrameId = requestAnimationFrame(tick);
        } catch (err) {
            alert("カメラを起動できませんでした");
        }
    }

    function tick() {
        if (qrCameraVideo.readyState === qrCameraVideo.HAVE_ENOUGH_DATA) {
            qrCanvas.height = qrCameraVideo.videoHeight;
            qrCanvas.width = qrCameraVideo.videoWidth;
            const ctx = qrCanvas.getContext("2d");
            ctx.drawImage(qrCameraVideo, 0, 0, qrCanvas.width, qrCanvas.height);
            const imageData = ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });

            if (code) {
                try {
                    const data = JSON.parse(code.data);
                    if (data.amount && data.shopId) {
                        currentScanData = data;
                        scannedAmountEl.textContent = `¥ ${parseInt(data.amount).toLocaleString()}`;
                        readAmountDisplay.classList.remove('hidden');
                        confirmPayBtn.classList.remove('hidden');
                        // 読み取り成功したら停止
                        stopQrReader();
                        return;
                    }
                } catch (e) { /* JSONでない場合は無視 */ }
            }
        }
        animationFrameId = requestAnimationFrame(tick);
    }

    function stopQrReader() {
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
        cancelAnimationFrame(animationFrameId);
    }

    // --- 支払い確定処理 ---
    async function handlePayment() {
        if (!currentScanData) return;
        const amount = parseInt(currentScanData.amount);

        if (balance < amount) return alert("残高が不足しています");

        try {
            // Firebaseへ送信（ここがエラーの主な原因）
            if (window.database) {
                await window.database.ref('paymentStatuses').push({
                    amount: amount,
                    shopId: currentScanData.shopId,
                    customerId: myCustomerId,
                    transactionId: currentScanData.transactionId || Date.now(),
                    timestamp: new Date().toISOString(),
                    status: 'success'
                });
            }

            balance -= amount;
            localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, balance);
            transactions.push({ type: 'payment', amount, shopId: currentScanData.shopId, timestamp: new Date().toISOString() });
            localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));

            document.getElementById('completedAmount').textContent = `¥ ${amount.toLocaleString()}`;
            document.getElementById('completedShopId').textContent = `店舗: ${currentScanData.shopId}`;
            
            updateBalanceDisplay();
            updateHistoryDisplay();
            showSection(paymentCompletionSection);
        } catch (e) {
            console.error("Firebase Write Error:", e);
            alert("支払いエラーが発生しました。ネットワークまたは設定を確認してください: " + e.message);
        }
    }

    // --- 送金受け取り (QR表示) ---
    function showReceiveQr() {
        const qrContainer = document.getElementById('receiveQrCode');
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: JSON.stringify({ type: 'receive', customerId: myCustomerId }),
            width: 200, height: 200
        });
        showSection(receiveQrSection);
    }

    // --- イベントリスナー ---
    document.getElementById('showQrReaderBtn').onclick = startQrReader;
    document.getElementById('showChargeBtn').onclick = () => { chargeAmountInput.value = ''; updatePredictedBalance(); showSection(chargeSection); };
    document.getElementById('showReceiveBtn').onclick = showReceiveQr;
    document.getElementById('cancelQrReadBtn').onclick = () => { stopQrReader(); showSection(mainPaymentSection); };
    document.getElementById('cancelChargeBtn').onclick = () => showSection(mainPaymentSection);
    document.getElementById('closeReceiveBtn').onclick = () => showSection(mainPaymentSection);
    document.getElementById('confirmChargeBtn').onclick = handleCharge;
    document.getElementById('confirmPayBtn').onclick = handlePayment;
    chargeAmountInput.oninput = updatePredictedBalance;

    document.querySelectorAll('.primary-btn').forEach(btn => {
        if (btn.id.includes('backToMain') || btn.id.includes('backToMainFromCompletionBtn')) {
            btn.onclick = () => showSection(mainPaymentSection);
        }
    });

    // 送金監視
    if (window.database) {
        window.database.ref('remittances/' + myCustomerId).on('child_added', async (snapshot) => {
            const data = snapshot.val();
            const amount = parseInt(data.amount);
            if (amount > 0) {
                balance += amount;
                localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, balance);
                transactions.push({ type: 'charge', amount, timestamp: new Date().toISOString() });
                localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));
                updateBalanceDisplay();
                updateHistoryDisplay();
                document.getElementById('receivedAmountDisplay').textContent = `¥ ${amount.toLocaleString()}`;
                showSection(receiveCompletionSection);
                await snapshot.ref.remove();
            }
        });
    }
});
