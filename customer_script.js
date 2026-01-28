document.addEventListener('DOMContentLoaded', () => {
    // --- 設定・定数 ---
    const LOCAL_STORAGE_BALANCE_KEY = 'posipay_balance';
    const LOCAL_STORAGE_TRANSACTIONS_KEY = 'posipay_transactions';
    const LOCAL_STORAGE_USER_ID_KEY = 'posipay_user_id';
    const MAX_BALANCE = 1000000; // 100万円上限
    const AUTO_DELAY = 3000;

    let balance = parseInt(localStorage.getItem(LOCAL_STORAGE_BALANCE_KEY)) || 0;
    let transactions = JSON.parse(localStorage.getItem(LOCAL_STORAGE_TRANSACTIONS_KEY)) || [];
    let myCustomerId = localStorage.getItem(LOCAL_STORAGE_USER_ID_KEY);

    if (!myCustomerId) {
        myCustomerId = 'USR-' + Math.random().toString(36).substring(2, 9).toUpperCase();
        localStorage.setItem(LOCAL_STORAGE_USER_ID_KEY, myCustomerId);
    }

    // --- DOM要素 (元のコードを維持) ---
    const currentBalanceEl = document.getElementById('currentBalance');
    const transactionHistoryEl = document.getElementById('transactionHistory');
    const mainPaymentSection = document.getElementById('mainPaymentSection');
    const showQrReaderBtn = document.getElementById('showQrReaderBtn');
    const showChargeBtn = document.getElementById('showChargeBtn');
    const showReceiveBtn = document.getElementById('showReceiveBtn');
    const qrReaderSection = document.getElementById('qrReaderSection');
    const qrCameraVideo = document.getElementById('qrCameraVideo');
    const qrCanvas = document.getElementById('qrCanvas');
    const cameraStatus = document.getElementById('cameraStatus');
    const scannedAmountEl = document.getElementById('scannedAmount');
    const readAmountDisplay = document.getElementById('readAmountDisplay');
    const confirmPayBtn = document.getElementById('confirmPayBtn');
    const cancelQrReadBtn = document.getElementById('cancelQrReadBtn');
    const receiveQrSection = document.getElementById('receiveQrSection');
    const receiveQrCodeEl = document.getElementById('receiveQrCode');
    const closeReceiveBtn = document.getElementById('closeReceiveBtn');
    const chargeSection = document.getElementById('chargeSection');
    const chargeAmountInput = document.getElementById('chargeAmountInput');
    const confirmChargeBtn = document.getElementById('confirmChargeBtn');
    const cancelChargeBtn = document.getElementById('cancelChargeBtn');
    const paymentCompletionSection = document.getElementById('paymentCompletionSection');
    const chargeCompletionSection = document.getElementById('chargeCompletionSection');
    const receiveCompletionSection = document.getElementById('receiveCompletionSection');
    const receivedAmountDisplayEl = document.getElementById('receivedAmountDisplay');
    const backToMainFromCompletionBtn = document.getElementById('backToMainFromCompletionBtn');
    const backToMainFromChargeCompletionBtn = document.getElementById('backToMainFromChargeCompletionBtn');
    const backToMainFromReceiveBtn = document.getElementById('backToMainFromReceiveBtn');

    let videoStream = null;
    let animationFrameId = null;
    let currentScanData = null;
    let autoTimer = null;

    // --- 初期化 ---
    const myIdDisplay = document.getElementById('myIdDisplay');
    if (myIdDisplay) myIdDisplay.textContent = `ID: ${myCustomerId}`;
    updateBalanceDisplay();
    updateHistoryDisplay();

    // --- 表示系関数 ---
    function updateBalanceDisplay() {
        currentBalanceEl.textContent = `¥ ${balance.toLocaleString()}`;
    }

    function showSection(section) {
        [mainPaymentSection, qrReaderSection, chargeSection, receiveQrSection, 
         paymentCompletionSection, chargeCompletionSection, receiveCompletionSection].forEach(s => {
            if (s) s.classList.add('hidden');
        });
        section.classList.remove('hidden');
        if (autoTimer) clearTimeout(autoTimer);
    }

    function updateHistoryDisplay() {
        transactionHistoryEl.innerHTML = '';
        transactions.slice().reverse().forEach(t => {
            const li = document.createElement('li');
            li.className = `history-item ${t.type}`;
            const date = new Date(t.timestamp).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const sign = (t.type === 'payment') ? '-' : '+';
            li.innerHTML = `<span>${sign} ¥${t.amount.toLocaleString()}</span><span class="history-date">${date}</span>`;
            transactionHistoryEl.appendChild(li);
        });
    }

    // --- チャージ機能 (100万円制限追加) ---
    const updatePredictedBalance = () => {
        let inputVal = parseInt(chargeAmountInput.value) || 0;
        
        // 入力した瞬間に合計が100万を超える場合は、入力を上限ギリギリに書き換える
        if (balance + inputVal > MAX_BALANCE) {
            inputVal = MAX_BALANCE - balance;
            chargeAmountInput.value = inputVal > 0 ? inputVal : 0;
        }

        const predicted = balance + (parseInt(chargeAmountInput.value) || 0);
        const newBalanceText = document.getElementById('newBalanceText');
        if (newBalanceText) {
            newBalanceText.textContent = `チャージ後残高: ¥ ${predicted.toLocaleString()}`;
        }
    };

    function handleCharge() {
        const amount = parseInt(chargeAmountInput.value);
        if (!amount || amount <= 0) return alert("金額を正しく入力してください");
        
        // 確定時の最終チェック
        if (balance + amount > MAX_BALANCE) {
            return alert("残高上限は100万円です。");
        }

        balance += amount;
        localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, balance);
        transactions.push({ type: 'charge', amount, timestamp: new Date().toISOString() });
        localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));

        const chargedAmountEl = document.getElementById('chargedAmount');
        if (chargedAmountEl) chargedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
        
        updateBalanceDisplay();
        updateHistoryDisplay();
        showSection(chargeCompletionSection);
    }

    // --- QRコード関連 (元のロジックを維持) ---
    async function startQrReader() {
        showSection(qrReaderSection);
        readAmountDisplay.classList.add('hidden');
        confirmPayBtn.classList.add('hidden');
        currentScanData = null;

        try {
            videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            qrCameraVideo.srcObject = videoStream;
            qrCameraVideo.play();
            animationFrameId = requestAnimationFrame(tick);
        } catch (err) {
            alert("カメラの起動に失敗しました。");
        }
    }

    function tick() {
        if (qrCameraVideo.readyState === qrCameraVideo.HAVE_ENOUGH_DATA) {
            qrCanvas.height = qrCameraVideo.videoHeight;
            qrCanvas.width = qrCameraVideo.videoWidth;
            const ctx = qrCanvas.getContext("2d");
            ctx.drawImage(qrCameraVideo, 0, 0, qrCanvas.width, qrCanvas.height);
            const code = jsQR(ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height).data, qrCanvas.width, qrCanvas.height);

            if (code) {
                try {
                    const data = JSON.parse(code.data);
                    if (data.amount && data.shopId) {
                        currentScanData = data;
                        scannedAmountEl.textContent = `¥ ${parseInt(data.amount).toLocaleString()}`;
                        readAmountDisplay.classList.remove('hidden');
                        confirmPayBtn.classList.remove('hidden');
                        stopQrReader();
                        return;
                    }
                } catch (e) {}
            }
        }
        animationFrameId = requestAnimationFrame(tick);
    }

    function stopQrReader() {
        if (videoStream) {
            videoStream.getTracks().forEach(t => t.stop());
            videoStream = null;
        }
        cancelAnimationFrame(animationFrameId);
    }

    // --- 支払い実行 (エラー対策追加) ---
    async function handlePayment() {
        if (!currentScanData) return;
        const amount = parseInt(currentScanData.amount);

        if (balance < amount) return alert("残高が不足しています。");

        try {
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

            const completedAmountEl = document.getElementById('completedAmount');
            const completedShopIdEl = document.getElementById('completedShopId');
            if (completedAmountEl) completedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
            if (completedShopIdEl) completedShopIdEl.textContent = `店舗: ${currentScanData.shopId}`;

            updateBalanceDisplay();
            updateHistoryDisplay();
            showSection(paymentCompletionSection);
        } catch (e) {
            console.error("Firebase Error:", e);
            alert("通信エラーが発生しました。");
        }
    }

    function showReceiveQr() {
        receiveQrCodeEl.innerHTML = '';
        new QRCode(receiveQrCodeEl, {
            text: JSON.stringify({ type: 'receive', customerId: myCustomerId }),
            width: 200, height: 200
        });
        showSection(receiveQrSection);
    }

    // --- イベントリスナー (元の設定を完全維持) ---
    showQrReaderBtn.onclick = startQrReader;
    showChargeBtn.onclick = () => {
        chargeAmountInput.value = '';
        updatePredictedBalance();
        showSection(chargeSection);
    };
    showReceiveBtn.onclick = showReceiveQr;
    cancelQrReadBtn.onclick = () => {
        stopQrReader();
        showSection(mainPaymentSection);
    };

    cancelChargeBtn.onclick = () => showSection(mainPaymentSection);
    closeReceiveBtn.onclick = () => showSection(mainPaymentSection);
    
    // 戻るボタンの挙動を維持
    backToMainFromCompletionBtn.onclick = () => {
        stopQrReader();
        showSection(mainPaymentSection);
    };
    backToMainFromChargeCompletionBtn.onclick = () => showSection(mainPaymentSection);
    if(backToMainFromReceiveBtn) {
        backToMainFromReceiveBtn.onclick = () => showSection(mainPaymentSection);
    }

    confirmChargeBtn.onclick = handleCharge;
    confirmPayBtn.onclick = handlePayment;
    chargeAmountInput.oninput = updatePredictedBalance;

    // 送金監視
    if (window.database) {
        window.database.ref('remittances/' + myCustomerId).on('child_added', (snapshot) => {
            const data = snapshot.val();
            const amount = parseInt(data.amount);
            if (amount > 0) {
                balance += amount;
                localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, balance);
                transactions.push({ type: 'charge', amount, timestamp: new Date().toISOString() });
                localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));
                updateBalanceDisplay();
                updateHistoryDisplay();
                if(receivedAmountDisplayEl) receivedAmountDisplayEl.textContent = `¥ ${amount.toLocaleString()}`;
                showSection(receiveCompletionSection);
                autoTimer = setTimeout(() => { showSection(mainPaymentSection); }, AUTO_DELAY);
                snapshot.ref.remove();
            }
        });
    }
});
