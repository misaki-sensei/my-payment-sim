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

    // ★追加: 受け取り完了画面用
    const receiveCompletionSection = document.getElementById('receiveCompletionSection');
    const receivedAmountDisplayEl = document.getElementById('receivedAmountDisplay');
    const backToMainFromReceiveBtn = document.getElementById('backToMainFromReceiveBtn');

    // --- 定数 ---
    const LOCAL_STORAGE_BALANCE_KEY = 'customerMockPayPayBalance';
    const LOCAL_STORAGE_TRANSACTIONS_KEY = 'customerMockPayPayTransactions';
    const LOCAL_STORAGE_DAILY_CHARGE_KEY = 'customerMockPayPayDailyCharges';
    const DAILY_CHARGE_LIMIT = 100000; 
    const MAX_TOTAL_BALANCE = 100000000; 
    const AUTO_CLOSE_DELAY = 3000; // 3秒

    // 変数
    let balance = 0;
    let transactions = [];
    let dailyCharges = [];
    let scannedData = null;
    let videoStream = null;
    let requestAnimFrameId = null; // カメラの描画ループ用
    let myCustomerId = localStorage.getItem('customerMockPayPayId');
    let autoCloseTimer = null; 

    if (!myCustomerId) {
        myCustomerId = `CUST-${Math.floor(Math.random() * 900000) + 100000}`;
        localStorage.setItem('customerMockPayPayId', myCustomerId);
    }

    // --- 関数 ---
    const loadAppData = () => {
        balance = parseFloat(localStorage.getItem(LOCAL_STORAGE_BALANCE_KEY)) || 0;
        transactions = JSON.parse(localStorage.getItem(LOCAL_STORAGE_TRANSACTIONS_KEY)) || [];
        dailyCharges = JSON.parse(localStorage.getItem(LOCAL_STORAGE_DAILY_CHARGE_KEY)) || [];
        
        const today = new Date().toDateString();
        dailyCharges = dailyCharges.filter(c => new Date(c.timestamp).toDateString() === today);
        localStorage.setItem(LOCAL_STORAGE_DAILY_CHARGE_KEY, JSON.stringify(dailyCharges));

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
            li.innerHTML = `<span>${t.type==='payment'?'支払い':'チャージ'}</span><span>¥ ${t.amount.toLocaleString()}</span><span class="history-date">${dateStr}</span>`;
            transactionHistoryEl.appendChild(li);
        });
    };

    const showSection = (target) => {
        if (autoCloseTimer) {
            clearTimeout(autoCloseTimer);
            autoCloseTimer = null;
        }
        
        [mainPaymentSection, qrReaderSection, receiveQrSection, chargeSection, paymentCompletionSection, chargeCompletionSection, receiveCompletionSection].forEach(s => s.classList.add('hidden'));
        target.classList.remove('hidden');
    };

    const updatePredictedBalance = () => {
        const val = parseInt(chargeAmountInput.value);
        const addAmount = isNaN(val) ? 0 : val;
        predictedBalanceEl.textContent = (balance + addAmount).toLocaleString();
    };

    // --- QRカメラ (支払い用) ---
    // ★修正: お店側と同じ、より確実な起動方法に変更
    const startQrReader = () => {
        showSection(qrReaderSection);
        cameraStatus.textContent = 'カメラ起動中...';
        cameraStatus.classList.remove('hidden');

        // ビデオ要素の設定を確実に行う
        qrCameraVideo.setAttribute("playsinline", true); 
        qrCameraVideo.setAttribute("muted", true); 
        qrCameraVideo.style.display = 'block';

        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(stream => {
                videoStream = stream;
                qrCameraVideo.srcObject = stream;
                qrCameraVideo.play();
                requestAnimFrameId = requestAnimationFrame(tick);
                cameraStatus.textContent = '読み取り中...';
            })
            .catch(err => {
                console.error("Camera Error:", err);
                cameraStatus.textContent = 'カメラエラー: ' + err.message;
            });
    };

    const tick = () => {
        if (qrCameraVideo.readyState === qrCameraVideo.HAVE_ENOUGH_DATA) {
            qrCanvas.hidden = false;
            qrCanvas.width = qrCameraVideo.videoWidth;
            qrCanvas.height = qrCameraVideo.videoHeight;
            const ctx = qrCanvas.getContext('2d');
            ctx.drawImage(qrCameraVideo, 0, 0, qrCanvas.width, qrCanvas.height);
            
            const imageData = ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
            
            if (code) {
                try {
                    const data = JSON.parse(code.data);
                    // 店舗IDと金額がある場合のみ反応
                    if (data.amount && data.shopId) {
                        scannedData = data;
                        cameraStatus.textContent = '読み取り成功';
                        scannedAmountEl.textContent = `¥ ${parseInt(data.amount).toLocaleString()}`;
                        readAmountDisplay.classList.remove('hidden');
                        confirmPayBtn.classList.remove('hidden');
                        
                        // 読み取り成功したらカメラ停止
                        stopQrReader(false); // false = セクション遷移はしない
                        return;
                    }
                } catch(e) {
                    // JSONでないデータは無視
                }
            }
        }
        if (videoStream && videoStream.active) {
            requestAnimFrameId = requestAnimationFrame(tick);
        }
    };

    const stopQrReader = (hideSectionFlag = true) => {
        if (requestAnimFrameId) cancelAnimationFrame(requestAnimFrameId);
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
        qrCameraVideo.style.display = 'none';
        if (hideSectionFlag) {
            // キャンセルボタンなどで完全に閉じる場合
        }
    };

    // --- チャージ処理 ---
    const handleCharge = () => {
        const amount = parseInt(chargeAmountInput.value);
        if (!amount || amount <= 0) return alert('正しい金額を入力してください');

        const currentDailyTotal = dailyCharges.reduce((sum, c) => sum + c.amount, 0);
        if (currentDailyTotal + amount > DAILY_CHARGE_LIMIT) {
            return alert(`1日のチャージ上限は${(DAILY_CHARGE_LIMIT/10000)}万円です。\n本日のチャージ済み: ${currentDailyTotal.toLocaleString()}円`);
        }
        if (balance + amount > MAX_TOTAL_BALANCE) {
            return alert(`残高上限(${MAX_TOTAL_BALANCE/100000000}億円)を超えるためチャージできません。`);
        }

        balance += amount;
        localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, balance);
        
        const now = new Date().toISOString();
        transactions.push({ type: 'charge', amount: amount, timestamp: now });
        localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));
        
        dailyCharges.push({ amount: amount, timestamp: now });
        localStorage.setItem(LOCAL_STORAGE_DAILY_CHARGE_KEY, JSON.stringify(dailyCharges));

        updateBalanceDisplay();
        updateHistoryDisplay();
        chargedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
        
        showSection(chargeCompletionSection);

        autoCloseTimer = setTimeout(() => {
            showSection(mainPaymentSection);
        }, AUTO_CLOSE_DELAY);
    };

    // --- 支払い処理 ---
    const handlePayment = () => {
        if (!scannedData) return;
        const amount = parseInt(scannedData.amount);
        if (balance < amount) return alert('残高不足です');

        balance -= amount;
        localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, balance);
        
        transactions.push({ type: 'payment', amount: amount, shopId: scannedData.shopId, timestamp: new Date().toISOString() });
        localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));
        
        if (window.database && scannedData.transactionId) {
             window.database.ref('payment_status/' + scannedData.transactionId).set({
                status: 'completed',
                userId: myCustomerId,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        }

        stopQrReader(); // 確実に停止
        updateBalanceDisplay();
        updateHistoryDisplay();
        completedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
        completedShopIdEl.textContent = scannedData.shopId;
        
        showSection(paymentCompletionSection);

        autoCloseTimer = setTimeout(() => {
            showSection(mainPaymentSection);
        }, AUTO_CLOSE_DELAY);
    };

    // --- イベント ---
    loadAppData();

    showQrReaderBtn.addEventListener('click', startQrReader); // 修正済みの関数を呼ぶ
    
    showChargeBtn.addEventListener('click', () => { 
        chargeAmountInput.value = ''; 
        updatePredictedBalance();     
        showSection(chargeSection); 
    });
    
    showReceiveBtn.addEventListener('click', () => {
        showSection(receiveQrSection);
        receiveQrCodeEl.innerHTML = '';
        new QRCode(receiveQrCodeEl, {
            text: JSON.stringify({ type: 'receive_money', userId: myCustomerId }),
            width: 200, height: 200
        });
    });

    cancelQrReadBtn.addEventListener('click', () => { stopQrReader(); showSection(mainPaymentSection); });
    cancelChargeBtn.addEventListener('click', () => showSection(mainPaymentSection));
    closeReceiveBtn.addEventListener('click', () => showSection(mainPaymentSection));
    
    backToMainFromCompletionBtn.addEventListener('click', () => showSection(mainPaymentSection));
    backToMainFromChargeCompletionBtn.addEventListener('click', () => showSection(mainPaymentSection));
    backToMainFromReceiveBtn.addEventListener('click', () => showSection(mainPaymentSection));

    confirmChargeBtn.addEventListener('click', handleCharge);
    confirmPayBtn.addEventListener('click', handlePayment);

    chargeAmountInput.addEventListener('input', updatePredictedBalance);

    // --- お金を受け取った時の処理 (Firebase Listener) ---
    window.database.ref('remittances/' + myCustomerId).on('child_added', (snapshot) => {
        const data = snapshot.val();
        const amount = parseInt(data.amount);
        if (amount > 0) {
            if (balance + amount <= MAX_TOTAL_BALANCE) {
                balance += amount;
                localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, balance);
                transactions.push({ type: 'charge', amount: amount, timestamp: new Date().toISOString() });
                localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));
                
                updateBalanceDisplay();
                updateHistoryDisplay();

                // ★修正: alertではなく専用の完了画面を表示
                receivedAmountDisplayEl.textContent = `¥ ${amount.toLocaleString()}`;
                showSection(receiveCompletionSection);

                // 3秒後に自動で閉じる
                autoCloseTimer = setTimeout(() => {
                    showSection(mainPaymentSection);
                }, AUTO_CLOSE_DELAY);
            }
            snapshot.ref.remove();
        }
    });
});
