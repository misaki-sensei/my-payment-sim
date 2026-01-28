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
    const scannedAmountEl = document.getElementById('scannedAmount');
    const readAmountDisplay = document.getElementById('readAmountDisplay');
    const confirmPayBtn = document.getElementById('confirmPayBtn');
    const cancelQrReadBtn = document.getElementById('cancelQrReadBtn');
    const chargeSection = document.getElementById('chargeSection');
    const chargeAmountInput = document.getElementById('chargeAmountInput');
    const predictedBalanceEl = document.getElementById('predictedBalance');
    const confirmChargeBtn = document.getElementById('confirmChargeBtn');
    const cancelChargeBtn = document.getElementById('cancelChargeBtn');
    const receiveQrSection = document.getElementById('receiveQrSection');
    const receiveQrCodeEl = document.getElementById('receiveQrCode');
    const closeReceiveBtn = document.getElementById('closeReceiveBtn');
    const paymentCompletionSection = document.getElementById('paymentCompletionSection');
    const completedAmountEl = document.getElementById('completedAmount');
    const backToMainFromCompletionBtn = document.getElementById('backToMainFromCompletionBtn');
    const receiveCompletionSection = document.getElementById('receiveCompletionSection');
    const receivedAmountDisplayEl = document.getElementById('receivedAmountDisplay');
    const backToMainFromReceiveBtn = document.getElementById('backToMainFromReceiveBtn');

    // --- 変数・定数 ---
    const STORAGE_BALANCE = 'customer_balance';
    const STORAGE_HISTORY = 'customer_history';
    const AUTO_DELAY = 2000;
    let balance = parseFloat(localStorage.getItem(STORAGE_BALANCE)) || 0;
    let transactions = JSON.parse(localStorage.getItem(STORAGE_HISTORY)) || [];
    let videoStream = null;
    let requestAnimId = null;
    let scannedData = null;
    let autoTimer = null;

    let myId = localStorage.getItem('customer_id');
    if (!myId) {
        myId = 'CUST' + Math.floor(Math.random() * 100000);
        localStorage.setItem('customer_id', myId);
    }
    document.getElementById('displayMyId').textContent = 'Your ID: ' + myId;

    // --- 100万上限の「打たせない」制限ロジック ---
    let lastValidValue = "";
    chargeAmountInput.addEventListener('input', () => {
        const currentVal = parseInt(chargeAmountInput.value);
        if (currentVal > 1000000) {
            // 100万を超えたら入力を拒否して戻す
            chargeAmountInput.value = lastValidValue;
        } else {
            lastValidValue = chargeAmountInput.value;
        }
        updatePredicted();
    });

    // --- 表示更新系 ---
    function updateBalance() {
        currentBalanceEl.textContent = `¥ ${balance.toLocaleString()}`;
    }

    function updatePredicted() {
        const add = parseInt(chargeAmountInput.value) || 0;
        predictedBalanceEl.textContent = (balance + add).toLocaleString();
    }

    function renderHistory() {
        transactionHistoryEl.innerHTML = '';
        transactions.slice().reverse().forEach(t => {
            const li = document.createElement('li');
            li.style.padding = "10px"; li.style.borderBottom = "1px solid #eee"; li.style.listStyle = "none";
            const color = t.type === 'charge' || t.type === 'receive' ? '#28a745' : '#dc3545';
            const label = t.type === 'charge' ? '＋チャージ' : (t.type === 'receive' ? '💰受取' : '💸支払い');
            li.innerHTML = `<strong style="color:${color}">${label}: ¥${t.amount.toLocaleString()}</strong><br><small>${t.time}</small>`;
            transactionHistoryEl.appendChild(li);
        });
    }

    function saveAction(type, amount) {
        const time = new Date().toLocaleString();
        transactions.push({ type, amount, time });
        localStorage.setItem(STORAGE_HISTORY, JSON.stringify(transactions));
        localStorage.setItem(STORAGE_BALANCE, balance);
        updateBalance();
        renderHistory();
    }

    function showSection(target) {
        if (autoTimer) clearTimeout(autoTimer);
        [mainPaymentSection, qrReaderSection, chargeSection, receiveQrSection, paymentCompletionSection, receiveCompletionSection].forEach(s => s.classList.add('hidden'));
        target.classList.remove('hidden');
    }

    // --- QR読み取り (支払い) ---
    function startCamera() {
        showSection(qrReaderSection);
        readAmountDisplay.classList.add('hidden');
        confirmPayBtn.classList.add('hidden');
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
            videoStream = stream;
            qrCameraVideo.srcObject = stream;
            requestAnimId = requestAnimationFrame(tick);
        });
    }

    function tick() {
        if (qrCameraVideo.readyState === qrCameraVideo.HAVE_ENOUGH_DATA) {
            qrCanvas.width = qrCameraVideo.videoWidth;
            qrCanvas.height = qrCameraVideo.videoHeight;
            const ctx = qrCanvas.getContext('2d');
            ctx.drawImage(qrCameraVideo, 0, 0, qrCanvas.width, qrCanvas.height);
            const code = jsQR(ctx.getImageData(0,0,qrCanvas.width,qrCanvas.height).data, qrCanvas.width, qrCanvas.height);
            if (code) {
                try {
                    scannedData = JSON.parse(code.data);
                    if (scannedData.amount) {
                        scannedAmountEl.textContent = `¥ ${parseInt(scannedData.amount).toLocaleString()}`;
                        readAmountDisplay.classList.remove('hidden');
                        confirmPayBtn.classList.remove('hidden');
                        stopCamera();
                        return;
                    }
                } catch(e) {}
            }
        }
        requestAnimId = requestAnimationFrame(tick);
    }

    function stopCamera() {
        if (videoStream) {
            videoStream.getTracks().forEach(t => t.stop());
            videoStream = null;
        }
        cancelAnimationFrame(requestAnimId);
    }

    // --- アクション ---
    confirmChargeBtn.onclick = () => {
        const amount = parseInt(chargeAmountInput.value);
        if (!amount || amount <= 0) return alert("金額を入力してください");
        balance += amount;
        saveAction('charge', amount);
        showSection(mainPaymentSection);
    };

    confirmPayBtn.onclick = async () => {
        const amount = parseInt(scannedData.amount);
        if (balance < amount) return alert("残高が足りません");
        
        try {
            await window.database.ref('paymentStatuses').push({
                amount: amount, shopId: scannedData.shopId, customerId: myId, transactionId: scannedData.transactionId, timestamp: new Date().toISOString()
            });
            balance -= amount;
            saveAction('payment', amount);
            completedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
            showSection(paymentCompletionSection);
            autoTimer = setTimeout(() => showSection(mainPaymentSection), AUTO_DELAY);
        } catch(e) { alert("支払いエラー"); }
    };

    // --- 送金受取監視 (Firebase) ---
    if (window.database) {
        window.database.ref('remittances/' + myId).on('child_added', (snap) => {
            const data = snap.val();
            const amount = parseInt(data.amount);
            balance += amount;
            saveAction('receive', amount);
            receivedAmountDisplayEl.textContent = `¥ ${amount.toLocaleString()}`;
            showSection(receiveCompletionSection);
            snap.ref.remove(); // 処理済みデータを削除
            autoTimer = setTimeout(() => showSection(mainPaymentSection), AUTO_DELAY);
        });
    }

    // --- ボタン紐付け ---
    showQrReaderBtn.onclick = startCamera;
    showChargeBtn.onclick = () => { chargeAmountInput.value = ''; updatePredicted(); showSection(chargeSection); };
    showReceiveBtn.onclick = () => {
        showSection(receiveQrSection);
        receiveQrCodeEl.innerHTML = '';
        new QRCode(receiveQrCodeEl, { text: JSON.stringify({ userId: myId }), width: 200, height: 200 });
    };
    cancelQrReadBtn.onclick = () => { stopCamera(); showSection(mainPaymentSection); };
    cancelChargeBtn.onclick = () => showSection(mainPaymentSection);
    closeReceiveBtn.onclick = () => showSection(mainPaymentSection);
    backToMainFromCompletionBtn.onclick = () => showSection(mainPaymentSection);
    backToMainFromReceiveBtn.onclick = () => showSection(mainPaymentSection);

    updateBalance();
    renderHistory();
});
