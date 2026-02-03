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
    const STORAGE_PREFIX = 'accountingApp_'; 
    const LOCAL_STORAGE_BALANCE_KEY = STORAGE_PREFIX + 'Balance';
    const LOCAL_STORAGE_TRANSACTIONS_KEY = STORAGE_PREFIX + 'Transactions';
    const LOCAL_STORAGE_DAILY_CHARGE_KEY = STORAGE_PREFIX + 'DailyCharges';
    const AUTO_DELAY = 2000; 

    // 設定
    const DAILY_CHARGE_LIMIT = 100000; 
    const INITIAL_BALANCE = 0;         

    // 変数
    let balance = 0;
    let transactions = [];
    let dailyCharges = [];
    let scannedData = null;
    let videoStream = null;
    let requestAnimFrameId = null; 
    let autoTimer = null; 
    let lastValidChargeInput = ""; // 入力制限用

    // スタッフID
    let myStaffId = localStorage.getItem(STORAGE_PREFIX + 'Id');
    if (!myStaffId) {
        myStaffId = `STAFF-${Math.floor(Math.random() * 900000) + 100000}`;
        localStorage.setItem(STORAGE_PREFIX + 'Id', myStaffId);
    }

    // --- 関数 ---
    const loadAppData = () => {
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
            const label = t.type === 'payment' ? '会計決済' : 'チャージ';
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

    // --- ★【修正】10万円を超える入力をその場で拒否する処理 ---
    const handleChargeInput = () => {
        const currentVal = chargeAmountInput.value;
        const numVal = parseInt(currentVal);

        if (numVal > 100000) {
            // 10万を超えたら入力を受け付けず、一歩手前の状態に戻す
            chargeAmountInput.value = lastValidChargeInput;
        } else {
            lastValidChargeInput = currentVal;
        }
        updatePredictedBalance();
    };

    const updatePredictedBalance = () => {
        const val = parseInt(chargeAmountInput.value);
        const addAmount = isNaN(val) ? 0 : val;
        if (predictedBalanceEl) predictedBalanceEl.textContent = (balance + addAmount).toLocaleString();
    };

    // --- QRカメラ ---
    const startQrReader = () => {
        scannedData = null; 
        if (scannedAmountEl) scannedAmountEl.textContent = "¥ 0";
        if (readAmountDisplay) readAmountDisplay.classList.add('hidden');
        if (confirmPayBtn) confirmPayBtn.classList.add('hidden');
        showSection(qrReaderSection);
        if(cameraStatus) {
            cameraStatus.textContent = '読み取り中...';
            cameraStatus.style.color = "";
        }
        if (videoStream) videoStream.getTracks().forEach(track => track.stop());

        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(stream => {
                videoStream = stream;
                qrCameraVideo.srcObject = stream;
                qrCameraVideo.play();
                requestAnimFrameId = requestAnimationFrame(tick);
            })
            .catch(err => { if(cameraStatus) cameraStatus.textContent = 'カメラエラー'; });
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
                        scannedData = data;
                        scannedAmountEl.textContent = `¥ ${parseInt(data.amount).toLocaleString()}`;
                        readAmountDisplay.classList.remove('hidden');
                        confirmPayBtn.classList.remove('hidden');
                        if(cameraStatus) {
                            cameraStatus.textContent = '✅ 読み取り成功';
                            cameraStatus.style.color = "#28a745";
                        }
                        cancelAnimationFrame(requestAnimFrameId);
                        qrCameraVideo.pause();
                        return;
                    }
                } catch(e) {}
            }
        }
        if (videoStream && videoStream.active) requestAnimFrameId = requestAnimationFrame(tick);
    };

    // --- ★【重要修正】お店側へ支払い完了を通知する処理 ---
    const handlePayment = async () => {
        if (!scannedData) return;
        const amount = parseInt(scannedData.amount);
        if (balance < amount) return alert('残高不足です');

        try {
            const nowIso = new Date().toISOString();
            if (window.database) {
                // お店側の .on('child_added') を発火させるために paymentStatuses へプッシュ
                await window.database.ref('paymentStatuses').push({
                    amount: amount, 
                    shopId: scannedData.shopId,
                    customerId: myStaffId,
                    timestamp: nowIso,
                    transactionId: scannedData.transactionId // お店側の照合用ID
                });
            }

            // 自アプリの処理
            balance -= amount;
            localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, balance);
            transactions.push({ type: 'payment', amount, shopId: scannedData.shopId, timestamp: nowIso });
            localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));

            updateBalanceDisplay();
            updateHistoryDisplay();
            
            completedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
            if (completedShopIdEl) completedShopIdEl.textContent = scannedData.shopId;
            showSection(paymentCompletionSection);

            autoTimer = setTimeout(() => { showSection(mainPaymentSection); }, AUTO_DELAY);
        } catch (e) {
            alert("決済エラー: " + e.message);
        }
    };

    // --- チャージ処理 ---
    const handleCharge = () => {
        const amount = parseInt(chargeAmountInput.value);
        if (!amount || amount <= 0) return alert('正しい金額を入力してください');
        
        const now = new Date();
        const today = now.toLocaleDateString();
        const todayTotal = dailyCharges.filter(c => c.date === today).reduce((sum, c) => sum + c.amount, 0);

        if (todayTotal + amount > DAILY_CHARGE_LIMIT) {
            alert(`1日の上限は${DAILY_CHARGE_LIMIT.toLocaleString()}円です。`);
            return;
        }

        balance += amount;
        localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, balance);
        transactions.push({ type: 'charge', amount, timestamp: now.toISOString() });
        localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));
        dailyCharges.push({ date: today, amount: amount });
        localStorage.setItem(LOCAL_STORAGE_DAILY_CHARGE_KEY, JSON.stringify(dailyCharges));

        updateBalanceDisplay();
        updateHistoryDisplay();
        chargedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
        showSection(chargeCompletionSection);
        autoTimer = setTimeout(() => { showSection(mainShopSection); }, AUTO_DELAY);
    };

    // --- イベント ---
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
        new QRCode(receiveQrCodeEl, { text: JSON.stringify({ type: 'receive_money', userId: myStaffId }), width: 200, height: 200 });
    };
    cancelQrReadBtn.onclick = () => { if (videoStream) videoStream.getTracks().forEach(t => t.stop()); showSection(mainPaymentSection); };
    cancelChargeBtn.onclick = () => showSection(mainPaymentSection);
    closeReceiveBtn.onclick = () => showSection(mainPaymentSection);
    backToMainFromCompletionBtn.onclick = () => showSection(mainPaymentSection);
    backToMainFromChargeCompletionBtn.onclick = () => showSection(mainPaymentSection);
    confirmChargeBtn.onclick = handleCharge;
    confirmPayBtn.onclick = handlePayment;
    chargeAmountInput.oninput = handleChargeInput;

    // 受取り監視
    if (window.database) {
        window.database.ref('remittances/' + myStaffId).on('child_added', (snapshot) => {
            const amount = parseInt(snapshot.val().amount);
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
