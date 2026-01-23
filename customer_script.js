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

    // 受け取りセクション
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

    // --- 定数 ---
    const LOCAL_STORAGE_BALANCE_KEY = 'customerMockPayPayBalance';
    const LOCAL_STORAGE_TRANSACTIONS_KEY = 'customerMockPayPayTransactions';
    const LOCAL_STORAGE_DAILY_CHARGE_KEY = 'customerMockPayPayDailyCharges';
    const DAILY_CHARGE_LIMIT = 100000; 
    const MAX_TOTAL_BALANCE = 100000000; 

    // 変数
    let balance = 0;
    let transactions = [];
    let dailyCharges = [];
    let scannedData = null;
    let videoStream = null;
    let qrScanInterval = null;
    let myCustomerId = localStorage.getItem('customerMockPayPayId');

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
        [mainPaymentSection, qrReaderSection, receiveQrSection, chargeSection, paymentCompletionSection, chargeCompletionSection].forEach(s => s.classList.add('hidden'));
        target.classList.remove('hidden');
    };

    // 予測残高の計算・表示更新
    const updatePredictedBalance = () => {
        const val = parseInt(chargeAmountInput.value);
        // 入力が空または不正な場合は0として計算
        const addAmount = isNaN(val) ? 0 : val;
        predictedBalanceEl.textContent = (balance + addAmount).toLocaleString();
    };

    // --- QRカメラ (支払い用) ---
    const startQrReader = async () => {
        cameraStatus.classList.remove('hidden');
        cameraStatus.textContent = 'カメラ起動中...';
        qrCameraVideo.style.display = 'block';
        try {
            videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            qrCameraVideo.srcObject = videoStream;
            qrCameraVideo.play();
            
            qrScanInterval = setInterval(() => {
                if (qrCameraVideo.videoWidth === 0) return;
                qrCanvas.width = qrCameraVideo.videoWidth;
                qrCanvas.height = qrCameraVideo.videoHeight;
                const ctx = qrCanvas.getContext('2d');
                ctx.drawImage(qrCameraVideo, 0, 0);
                const imageData = ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
                if (code) {
                    try {
                        const data = JSON.parse(code.data);
                        if (data.amount && data.shopId) {
                            clearInterval(qrScanInterval);
                            scannedData = data;
                            cameraStatus.textContent = '読み取り成功';
                            scannedAmountEl.textContent = `¥ ${parseInt(data.amount).toLocaleString()}`;
                            readAmountDisplay.classList.remove('hidden');
                            confirmPayBtn.classList.remove('hidden');
                        }
                    } catch(e) {}
                }
            }, 100);
        } catch (e) {
            cameraStatus.textContent = 'カメラエラー';
        }
    };

    const stopQrReader = () => {
        if (qrScanInterval) clearInterval(qrScanInterval);
        if (videoStream) videoStream.getTracks().forEach(t => t.stop());
        qrCameraVideo.style.display = 'none';
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

        stopQrReader();
        updateBalanceDisplay();
        updateHistoryDisplay();
        completedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
        completedShopIdEl.textContent = scannedData.shopId;
        showSection(paymentCompletionSection);
    };

    // --- イベント ---
    loadAppData();

    showQrReaderBtn.addEventListener('click', () => { showSection(qrReaderSection); startQrReader(); });
    
    // ★修正: チャージボタンを押した際、入力と予測残高表示をリセットする
    showChargeBtn.addEventListener('click', () => { 
        chargeAmountInput.value = ''; // 入力を空にする
        updatePredictedBalance();     // 予測残高を「現在の残高」のみの表示に戻す
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

    confirmChargeBtn.addEventListener('click', handleCharge);
    confirmPayBtn.addEventListener('click', handlePayment);

    // 入力があるたびに予測残高を更新
    chargeAmountInput.addEventListener('input', updatePredictedBalance);

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
                alert(`${amount}円を受け取りました！`);
            }
            snapshot.ref.remove();
        }
    });
});
