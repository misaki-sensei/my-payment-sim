document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素 ---
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
    const predictedBalanceEl = document.getElementById('predictedBalance');
    const paymentCompletionSection = document.getElementById('paymentCompletionSection');
    const completedAmountEl = document.getElementById('completedAmount');
    const completedShopIdEl = document.getElementById('completedShopId');
    const backToMainFromCompletionBtn = document.getElementById('backToMainFromCompletionBtn');
    const chargeCompletionSection = document.getElementById('chargeCompletionSection');
    const chargedAmountEl = document.getElementById('chargedAmount');
    const backToMainFromChargeCompletionBtn = document.getElementById('backToMainFromChargeCompletionBtn');
    const receiveCompletionSection = document.getElementById('receiveCompletionSection');
    const receivedAmountDisplayEl = document.getElementById('receivedAmountDisplay');
    const backToMainFromReceiveBtn = document.getElementById('backToMainFromReceiveBtn');

    // --- 会計アプリ専用の定数（お客アプリと分離） ---
    const STORAGE_PREFIX = 'accountingApp_';
    const LOCAL_STORAGE_BALANCE_KEY = STORAGE_PREFIX + 'Balance';
    const LOCAL_STORAGE_TRANSACTIONS_KEY = STORAGE_PREFIX + 'Transactions';
    const LOCAL_STORAGE_DAILY_CHARGE_KEY = STORAGE_PREFIX + 'DailyCharges';
    const LOCAL_STORAGE_ID_KEY = STORAGE_PREFIX + 'StaffId';
    
    const DAILY_CHARGE_LIMIT = 1000000; // 会計用なので上限を100万に設定
    const INITIAL_BALANCE = 0;
    const AUTO_DELAY = 2000; 

    // --- 変数 ---
    let balance = 0;
    let transactions = [];
    let dailyCharges = [];
    let scannedData = null;
    let videoStream = null;
    let requestAnimFrameId = null; 
    let autoTimer = null; 
    let lastValidChargeInput = "";

    // 会計スタッフIDの生成
    let myAccountingId = localStorage.getItem(LOCAL_STORAGE_ID_KEY);
    if (!myAccountingId) {
        myAccountingId = `STAFF-${Math.floor(Math.random() * 900000) + 100000}`;
        localStorage.setItem(LOCAL_STORAGE_ID_KEY, myAccountingId);
    }

    // --- 関数 ---
    const loadAppData = () => {
        const storedBalance = localStorage.getItem(LOCAL_STORAGE_BALANCE_KEY);
        balance = storedBalance === null ? INITIAL_BALANCE : parseFloat(storedBalance);
        transactions = JSON.parse(localStorage.getItem(LOCAL_STORAGE_TRANSACTIONS_KEY)) || [];
        dailyCharges = JSON.parse(localStorage.getItem(LOCAL_STORAGE_DAILY_CHARGE_KEY)) || [];
        updateBalanceDisplay();
        updateHistoryDisplay();
    };

    const updateBalanceDisplay = () => {
        currentBalanceEl.textContent = `¥ ${balance.toLocaleString()}`;
        localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, balance);
    };

    const updateHistoryDisplay = () => {
        transactionHistoryEl.innerHTML = '';
        transactions.slice().reverse().forEach(t => {
            const li = document.createElement('li');
            li.className = t.type;
            const dateStr = new Date(t.timestamp).toLocaleString('ja-JP');
            const label = t.type === 'payment' ? '支払い' : 'チャージ';
            li.innerHTML = `<span>${label}</span><span>¥ ${t.amount.toLocaleString()}</span><span class="history-date">${dateStr}</span>`;
            transactionHistoryEl.appendChild(li);
        });
    };

    const showSection = (target) => {
        if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
        const allSections = [
            mainPaymentSection, qrReaderSection, receiveQrSection, chargeSection, 
            paymentCompletionSection, chargeCompletionSection, receiveCompletionSection
        ];
        allSections.forEach(s => { if (s) s.classList.add('hidden'); });
        if (target) target.classList.remove('hidden');
    };

    const handleChargeInput = () => {
        const val = parseInt(chargeAmountInput.value);
        if (val > 1000000) {
            chargeAmountInput.value = lastValidChargeInput;
        } else {
            lastValidChargeInput = chargeAmountInput.value;
        }
        updatePredictedBalance();
    };

    const updatePredictedBalance = () => {
        const val = parseInt(chargeAmountInput.value) || 0;
        if (predictedBalanceEl) predictedBalanceEl.textContent = (balance + val).toLocaleString();
    };

    // --- QRスキャン (完全リセット版) ---
    const startQrReader = () => {
        // 前回のスキャン状態を完全に破棄
        scannedData = null; 
        scannedAmountEl.textContent = "¥ 0";
        readAmountDisplay.classList.add('hidden');
        confirmPayBtn.classList.add('hidden');

        showSection(qrReaderSection);
        if(cameraStatus) {
            cameraStatus.textContent = 'お店のQRを読み取ってください';
            cameraStatus.style.color = "";
            cameraStatus.style.fontWeight = "";
        }

        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
        }

        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(stream => {
                videoStream = stream;
                qrCameraVideo.srcObject = stream;
                qrCameraVideo.play();
                requestAnimFrameId = requestAnimationFrame(tick);
            })
            .catch(err => { if(cameraStatus) cameraStatus.textContent = 'カメラ起動エラー'; });
    };

    const tick = () => {
        if (qrCameraVideo.readyState === qrCameraVideo.HAVE_ENOUGH_DATA) {
            qrCanvas.width = qrCameraVideo.videoWidth;
            qrCanvas.height = qrCameraVideo.videoHeight;
            const ctx = qrCanvas.getContext('2d');
            ctx.drawImage(qrCameraVideo, 0, 0, qrCanvas.width, qrCanvas.height);
            const imageData = ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            
            if (code) {
                try {
                    const data = JSON.parse(code.data);
                    if (data.amount && data.transactionId) {
                        if(cameraStatus) {
                            cameraStatus.textContent = '✅ 読み取り完了';
                            cameraStatus.style.color = "#28a745";
                            cameraStatus.style.fontWeight = "bold";
                        }
                        scannedData = data;
                        scannedAmountEl.textContent = `¥ ${parseInt(data.amount).toLocaleString()}`;
                        readAmountDisplay.classList.remove('hidden');
                        confirmPayBtn.classList.remove('hidden');
                        stopQrReader();
                        qrCameraVideo.pause();
                        return;
                    }
                } catch(e) {}
            }
        }
        if (videoStream) requestAnimFrameId = requestAnimationFrame(tick);
    };

    const stopQrReader = () => {
        if (requestAnimFrameId) cancelAnimationFrame(requestAnimFrameId);
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
    };

    // --- 支払い実行 ---
    const handlePayment = async () => {
        if (!scannedData) return;
        const amount = parseInt(scannedData.amount);
        if (balance < amount) return alert('残高不足です');

        try {
            const nowIso = new Date().toISOString();
            if (window.database) {
                // 店舗側への完了通知
                await window.database.ref('payment_status/' + scannedData.transactionId).set({
                    status: 'completed', 
                    userId: myAccountingId, 
                    timestamp: Date.now()
                });
                // 履歴用データの保存
                await window.database.ref('paymentStatuses').push({
                    amount, shopId: scannedData.shopId, customerId: myAccountingId, timestamp: nowIso, transactionId: scannedData.transactionId
                });
            }

            balance -= amount;
            transactions.push({ type: 'payment', amount, shopId: scannedData.shopId, timestamp: nowIso });
            localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));

            updateBalanceDisplay();
            updateHistoryDisplay();
            completedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
            completedShopIdEl.textContent = scannedData.shopId;
            showSection(paymentCompletionSection);
            autoTimer = setTimeout(() => { showSection(mainPaymentSection); }, AUTO_DELAY);
        } catch (e) { alert("通信エラー: " + e.message); }
    };

    // --- チャージ実行 ---
    const handleCharge = () => {
        const amount = parseInt(chargeAmountInput.value);
        if (!amount || amount <= 0) return alert('金額を入力してください');

        balance += amount;
        const nowIso = new Date().toISOString();
        transactions.push({ type: 'charge', amount, timestamp: nowIso });
        localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));

        updateBalanceDisplay();
        updateHistoryDisplay();
        chargedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
        showSection(chargeCompletionSection);
        autoTimer = setTimeout(() => { showSection(mainPaymentSection); }, AUTO_DELAY);
    };

    // --- 登録 ---
    loadAppData();
    showQrReaderBtn.onclick = startQrReader;
    showChargeBtn.onclick = () => { 
        chargeAmountInput.value = ''; 
        lastValidChargeInput = ''; 
        updatePredictedBalance(); 
        showSection(chargeSection); 
    };
    showReceiveBtn.onclick = () => {
        showSection(receiveQrSection);
        receiveQrCodeEl.innerHTML = '';
        new QRCode(receiveQrCodeEl, {
            text: JSON.stringify({ type: 'receive_money', userId: myAccountingId }),
            width: 200, height: 200
        });
    };
    
    cancelQrReadBtn.onclick = () => { stopQrReader(); showSection(mainPaymentSection); };
    cancelChargeBtn.onclick = () => showSection(mainPaymentSection);
    closeReceiveBtn.onclick = () => showSection(mainPaymentSection);
    backToMainFromCompletionBtn.onclick = () => showSection(mainPaymentSection);
    backToMainFromChargeCompletionBtn.onclick = () => showSection(mainPaymentSection);
    if (backToMainFromReceiveBtn) backToMainFromReceiveBtn.onclick = () => showSection(mainPaymentSection);
    
    confirmChargeBtn.onclick = handleCharge;
    confirmPayBtn.onclick = handlePayment;
    chargeAmountInput.oninput = handleChargeInput;

    // 送金受け取り（Firebase監視）
    if (window.database) {
        window.database.ref('remittances/' + myAccountingId).on('child_added', (snapshot) => {
            const data = snapshot.val();
            const amount = parseInt(data.amount);
            if (amount > 0) {
                balance += amount;
                transactions.push({ type: 'charge', amount, timestamp: new Date().toISOString() });
                localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));
                updateBalanceDisplay();
                updateHistoryDisplay();
                receivedAmountDisplayEl.textContent = `¥ ${amount.toLocaleString()}`;
                showSection(receiveCompletionSection);
                autoTimer = setTimeout(() => { showSection(mainPaymentSection); }, AUTO_DELAY);
                snapshot.ref.remove();
            }
        });
    }
});
