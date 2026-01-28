document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素 ---
    const mainShopSection = document.getElementById('mainShopSection');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const generateQrBtn = document.getElementById('generateQrBtn');
    const startRemittanceBtn = document.getElementById('startRemittanceBtn');
    const qrDisplaySection = document.getElementById('qrDisplaySection');
    const qrCodeCanvas = document.getElementById('qrCodeCanvas');
    const resetAppBtn = document.getElementById('resetAppBtn');
    const shopScannerSection = document.getElementById('shopScannerSection');
    const shopCameraVideo = document.getElementById('shopCameraVideo');
    const shopQrCanvas = document.getElementById('shopQrCanvas');
    const cancelRemittanceBtn = document.getElementById('cancelRemittanceBtn');
    const remittanceAmountSection = document.getElementById('remittanceAmountSection');
    const targetUserIdDisplay = document.getElementById('targetUserIdDisplay');
    const remittanceAmountInput = document.getElementById('remittanceAmountInput');
    const confirmRemittanceBtn = document.getElementById('confirmRemittanceBtn');
    const backToScanBtn = document.getElementById('backToScanBtn');
    const paymentReceivedSection = document.getElementById('paymentReceivedSection');
    const receivedAmountEl = document.getElementById('receivedAmount');
    const receivedCustomerInfoEl = document.getElementById('receivedCustomerInfo');
    const backToMainFromShopCompletionBtn = document.getElementById('backToMainFromShopCompletionBtn');
    const remittanceCompletionSection = document.getElementById('remittanceCompletionSection');
    const sentAmountDisplay = document.getElementById('sentAmountDisplay');
    const sentToUserDisplay = document.getElementById('sentToUserDisplay');
    const backToMainFromRemittanceBtn = document.getElementById('backToMainFromRemittanceBtn');
    const shopTransactionHistoryEl = document.getElementById('shopTransactionHistory');

    // --- 定数・変数 ---
    const SHOP_ID = 'YanaharaSHOP001';
    const AUTO_DELAY = 2000; 
    const REMIT_DELAY = 3000;
    const STORAGE_KEY = 'shop_history_data';
    let currentExpectedTransactionId = null;
    let shopVideoObj = null;
    let targetUserId = null;
    let autoTimer = null;
    let transactions = [];

    // --- 入力値のブロック制限 (100万上限) ---
    const blockOverMillion = (inputEl) => {
        let lastValidValue = inputEl.value;
        inputEl.addEventListener('input', () => {
            const val = parseInt(inputEl.value);
            if (val > 1000000) {
                inputEl.value = lastValidValue; // 100万を超えたら前の値に強制固定
            } else {
                lastValidValue = inputEl.value;
            }
        });
    };
    blockOverMillion(paymentAmountInput);
    blockOverMillion(remittanceAmountInput);

    // --- 履歴表示管理 ---
    function loadHistory() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            transactions = JSON.parse(saved);
            transactions.forEach(t => renderHistoryItem(t));
        }
    }

    function saveAndRender(type, amount, userId) {
        const now = new Date();
        const timeStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const newTx = { type, amount, userId, time: timeStr };
        transactions.push(newTx);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
        renderHistoryItem(newTx);
    }

    function renderHistoryItem(t) {
        const li = document.createElement('li');
        li.style.padding = "12px"; 
        li.style.borderBottom = "1px solid #eee"; 
        li.style.listStyle = "none";
        const color = t.type === 'income' ? '#28a745' : '#ff9800';
        const label = t.type === 'income' ? '💰入金' : '💸送金';
        li.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items: center;">
                <div style="flex: 1; min-width: 0;">
                    <strong style="color:${color}">${label}: ¥${Math.abs(parseInt(t.amount)).toLocaleString()}</strong>
                    <div style="font-size:0.8em; color:#666; margin-top: 4px;">ID: ${t.userId}</div>
                </div>
                <div style="font-size:0.75em; color:#888; white-space: nowrap; margin-left: 10px; text-align: right;">${t.time}</div>
            </div>`;
        if (shopTransactionHistoryEl) shopTransactionHistoryEl.insertBefore(li, shopTransactionHistoryEl.firstChild);
    }

    function showSection(section) {
        if (autoTimer) clearTimeout(autoTimer);
        const all = [mainShopSection, qrDisplaySection, shopScannerSection, remittanceAmountSection, paymentReceivedSection, remittanceCompletionSection];
        all.forEach(s => { if(s) s.classList.add('hidden'); });
        if (section) section.classList.remove('hidden');
    }

    // --- 支払い受付処理 ---
    function startPayment(amount) {
        currentExpectedTransactionId = 'txn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const qrData = JSON.stringify({ shopId: SHOP_ID, amount: amount, transactionId: currentExpectedTransactionId });
        showSection(qrDisplaySection);
        qrCodeCanvas.innerHTML = '';
        new QRCode(qrCodeCanvas, { text: qrData, width: 200, height: 200 });
        database.ref('paymentStatuses').off();
        database.ref('paymentStatuses').on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (data && data.transactionId === currentExpectedTransactionId) {
                database.ref('paymentStatuses').off();
                handlePaymentCompleted(data.customerId || 'Unknown', amount);
            }
        });
    }

    function handlePaymentCompleted(userId, amount) {
        saveAndRender('income', amount, userId);
        receivedAmountEl.textContent = `¥ ${parseInt(amount).toLocaleString()}`;
        receivedCustomerInfoEl.textContent = `User: ${userId}`;
        showSection(paymentReceivedSection);
        autoTimer = setTimeout(() => { startPayment(amount); }, AUTO_DELAY);
    }

    // --- カメラ処理 ---
    function startShopQrReader() {
        showSection(shopScannerSection);
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(stream => {
                shopVideoObj = stream;
                shopCameraVideo.srcObject = stream;
                shopCameraVideo.play();
                requestAnimationFrame(tickShopQr);
            })
            .catch(err => alert("カメラを起動できませんでした"));
    }

    function tickShopQr() {
        if (shopCameraVideo.readyState === shopCameraVideo.HAVE_ENOUGH_DATA) {
            shopQrCanvas.height = shopCameraVideo.videoHeight;
            shopQrCanvas.width = shopCameraVideo.videoWidth;
            const ctx = shopQrCanvas.getContext("2d");
            ctx.drawImage(shopCameraVideo, 0, 0, shopQrCanvas.width, shopQrCanvas.height);
            const imageData = ctx.getImageData(0, 0, shopQrCanvas.width, shopQrCanvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code) {
                try {
                    const data = JSON.parse(code.data);
                    if (data.userId) {
                        stopCamera();
                        targetUserId = data.userId;
                        targetUserIdDisplay.textContent = targetUserId;
                        showSection(remittanceAmountSection);
                        return;
                    }
                } catch(e) {}
            }
        }
        if (shopVideoObj) requestAnimationFrame(tickShopQr);
    }

    function stopCamera() {
        if (shopVideoObj) {
            shopVideoObj.getTracks().forEach(t => t.stop());
            shopVideoObj = null;
        }
    }

    // --- イベントリスナー ---
    generateQrBtn.onclick = () => {
        const amount = parseInt(paymentAmountInput.value);
        if (amount > 0) startPayment(amount);
        else alert("金額を入力してください");
    };

    if (startRemittanceBtn) startRemittanceBtn.onclick = () => startShopQrReader();

    confirmRemittanceBtn.onclick = async () => {
        const amount = parseInt(remittanceAmountInput.value);
        if (!amount || amount <= 0) return alert("正しい金額を入力してください");
        try {
            const now = new Date().toISOString();
            await database.ref('paymentStatuses').push({
                amount: -amount, shopId: SHOP_ID, customerId: targetUserId, timestamp: now, transactionId: 'remit_' + Date.now()
            });
            await database.ref('remittances/' + targetUserId).push({ amount: amount, shopId: SHOP_ID, timestamp: now });
            saveAndRender('outgo', amount, targetUserId);
            sentAmountDisplay.textContent = `¥ ${amount.toLocaleString()}`;
            sentToUserDisplay.textContent = `宛先: ${targetUserId}`;
            showSection(remittanceCompletionSection);
            autoTimer = setTimeout(() => { showSection(mainShopSection); }, REMIT_DELAY);
        } catch (e) { alert("エラーが発生しました"); }
    };

    backToScanBtn.onclick = () => startShopQrReader();
    cancelRemittanceBtn.onclick = () => { stopCamera(); showSection(mainShopSection); };
    resetAppBtn.onclick = () => { database.ref('paymentStatuses').off(); showSection(mainShopSection); };
    backToMainFromShopCompletionBtn.onclick = () => showSection(mainShopSection);
    backToMainFromRemittanceBtn.onclick = () => showSection(mainShopSection);
    loadHistory();
});
