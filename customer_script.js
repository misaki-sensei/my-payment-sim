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

    // --- 定数 ---
    const LOCAL_STORAGE_BALANCE_KEY = 'customerMockPayPayBalance';
    const LOCAL_STORAGE_TRANSACTIONS_KEY = 'customerMockPayPayTransactions';
    const LOCAL_STORAGE_DAILY_CHARGE_KEY = 'customerMockPayPayDailyCharges';
    const AUTO_DELAY = 2000; 

    // ★追加設定: 制限と初期値
    const DAILY_CHARGE_LIMIT = 100000; // 1日の上限10万円
    const INITIAL_BALANCE = 0;        // ★初期資産を0円に設定（表示用）
    const MAX_ASSETS = 100000000;     // 内部的な総資産設定（1億円）

    // 変数
    let balance = 0;
    let transactions = [];
    let dailyCharges = [];
    let scannedData = null;
    let videoStream = null;
    let requestAnimFrameId = null; 
    let myCustomerId = localStorage.getItem('customerMockPayPayId');
    let autoTimer = null; 

    if (!myCustomerId) {
        myCustomerId = `CUST-${Math.floor(Math.random() * 900000) + 100000}`;
        localStorage.setItem('customerMockPayPayId', myCustomerId);
    }

    // --- 関数 ---
    const loadAppData = () => {
        // ★修正: ストレージが空なら INITIAL_BALANCE(0) をセット
        const storedBalance = localStorage.getItem(LOCAL_STORAGE_BALANCE_KEY);
        if (storedBalance === null) {
            balance = INITIAL_BALANCE;
            localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, balance);
        } else {
            balance = parseFloat(storedBalance) || 0;
        }

        transactions = JSON.parse(localStorage.getItem(LOCAL_STORAGE_TRANSACTIONS_KEY)) || [];
        dailyCharges = JSON.parse(localStorage.getItem(LOCAL_STORAGE_DAILY_CHARGE_KEY)) || [];
        updateBalanceDisplay();
        updateHistoryDisplay();
    };

    const updateBalanceDisplay = () => {
        currentBalanceEl.textContent = `¥ ${balance.toLocaleString()}`;
    };

    const updateHistoryDisplay = () => {
        transactionHistoryEl.innerHTML = '';
        const displayList = transactions.slice().reverse();
        displayList.forEach(t => {
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

    const updatePredictedBalance = () => {
        const val = parseInt(chargeAmountInput.value);
        const addAmount = isNaN(val) ? 0 : val;
        predictedBalanceEl.textContent = (balance + addAmount).toLocaleString();
    };

    // --- QRカメラ (フィードバック維持) ---
    const startQrReader = () => {
        showSection(qrReaderSection);
        scannedData = null;
        readAmountDisplay.classList.add('hidden');
        confirmPayBtn.classList.add('hidden');
        
        if(cameraStatus) {
            cameraStatus.textContent = '読み取り中...';
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
                qrCameraVideo.setAttribute("playsinline", true); 
                qrCameraVideo.play();
                requestAnimFrameId = requestAnimationFrame(tick);
            })
            .catch(err => {
                if(cameraStatus) cameraStatus.textContent = 'カメラエラー';
            });
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
                    if (data.amount && data.shopId && data.transactionId) {
                        if(cameraStatus) {
                            cameraStatus.textContent = '✅ 読み取りました！';
                            cameraStatus.style.color = "#28a745";
                            cameraStatus.style.fontWeight = "bold";
                        }

                        setTimeout(() => {
                            scannedData = data;
                            scannedAmountEl.textContent = `¥ ${parseInt(data.amount).toLocaleString()}`;
                            readAmountDisplay.classList.remove('hidden');
                            confirmPayBtn.classList.remove('hidden');
                            cancelAnimationFrame(requestAnimFrameId);
                            qrCameraVideo.pause();
                        }, 300);
                        return;
                    }
                } catch(e) {}
            }
        }
        if (videoStream && videoStream.active) {
            requestAnimFrameId = requestAnimationFrame(tick);
        }
    }

    const stopQrReader = () => {
        if (requestAnimFrameId) cancelAnimationFrame(requestAnimFrameId);
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
    };

    // --- 支払い処理 ---
    const handlePayment = async () => {
        if (!scannedData) return;
        const amount = parseInt(scannedData.amount);
        if (balance < amount) return alert('残高不足です');

        try {
            const nowIso = new Date().toISOString();
            if (window.database) {
                await window.database.ref('paymentStatuses').push({
                    amount: amount, shopId: scannedData.shopId,
                    customerId: myCustomerId, timestamp: nowIso,
                    transactionId: scannedData.transactionId 
                });
                await window.database.ref('payment_status/' + scannedData.transactionId).set({
                    status: 'completed', userId: myCustomerId, timestamp: Date.now()
                });
            }

            balance -= amount;
            localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, balance);
            transactions.push({ type: 'payment', amount, shopId: scannedData.shopId, timestamp: nowIso });
            localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));

            stopQrReader(); 
            updateBalanceDisplay();
            updateHistoryDisplay();
            
            completedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
            completedShopIdEl.textContent = scannedData.shopId;
            showSection(paymentCompletionSection);
            autoTimer = setTimeout(() => { showSection(mainPaymentSection); }, AUTO_DELAY);
        } catch (e) {
            alert("支払いエラー: " + e.message);
        }
    };

    // --- チャージ処理 (10万円制限・回数無制限) ---
    const handleCharge = () => {
        const amount = parseInt(chargeAmountInput.value);
        if (!amount || amount <= 0) return alert('正しい金額を入力してください');

        const now = new Date();
        const today = now.toLocaleDateString();

        // 今日の合計金額を計算
        const todayTotal = dailyCharges
            .filter(c => c.date === today)
            .reduce((sum, c) => sum + c.amount, 0);

        // ★金額制限チェック (10万円)
        if (todayTotal + amount > DAILY_CHARGE_LIMIT) {
            const remaining = DAILY_CHARGE_LIMIT - todayTotal;
            alert(`1日のチャージ上限は${DAILY_CHARGE_LIMIT.toLocaleString()}円です。\n本日はあと${remaining.toLocaleString()}円チャージ可能です。`);
            return;
        }

        // 実行
        balance += amount;
        localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, balance);

        const nowIso = now.toISOString();
        transactions.push({ type: 'charge', amount, timestamp: nowIso });
        localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));

        // 制限記録用
        dailyCharges.push({ date: today, amount: amount });
        localStorage.setItem(LOCAL_STORAGE_DAILY_CHARGE_KEY, JSON.stringify(dailyCharges));

        updateBalanceDisplay();
        updateHistoryDisplay();
        
        chargedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
        showSection(chargeCompletionSection);
        autoTimer = setTimeout(() => { showSection(mainPaymentSection); }, AUTO_DELAY);
    };

    // --- イベントリスナー ---
    loadAppData();
    showQrReaderBtn.onclick = startQrReader;
    showChargeBtn.onclick = () => { 
        chargeAmountInput.value = ''; updatePredictedBalance(); showSection(chargeSection); 
    };
    showReceiveBtn.onclick = () => {
        showSection(receiveQrSection);
        receiveQrCodeEl.innerHTML = '';
        new QRCode(receiveQrCodeEl, {
            text: JSON.stringify({ type: 'receive_money', userId: myCustomerId }),
            width: 200, height: 200
        });
    };

    cancelQrReadBtn.onclick = () => { stopQrReader(); showSection(mainPaymentSection); };
    cancelChargeBtn.onclick = () => showSection(mainPaymentSection);
    closeReceiveBtn.onclick = () => showSection(mainPaymentSection);
    backToMainFromCompletionBtn.onclick = () => showSection(mainPaymentSection);
    backToMainFromChargeCompletionBtn.onclick = () => showSection(mainPaymentSection);
    
    confirmChargeBtn.onclick = handleCharge;
    confirmPayBtn.onclick = handlePayment;
    chargeAmountInput.oninput = updatePredictedBalance;

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
                receivedAmountDisplayEl.textContent = `¥ ${amount.toLocaleString()}`;
                showSection(receiveCompletionSection);
                autoTimer = setTimeout(() => { showSection(mainPaymentSection); }, AUTO_DELAY);
                snapshot.ref.remove();
            }
        });
    }
});
