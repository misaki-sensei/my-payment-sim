document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素 ---
    const mainShopSection = document.getElementById('mainShopSection');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const generateQrBtn = document.getElementById('generateQrBtn');
    
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

    const paymentReceivedSection = document.getElementById('paymentReceivedSection');
    const receivedAmountEl = document.getElementById('receivedAmount');
    const receivedCustomerInfoEl = document.getElementById('receivedCustomerInfo');
    const backToMainFromShopCompletionBtn = document.getElementById('backToMainFromShopCompletionBtn');

    const shopTransactionHistoryEl = document.getElementById('shopTransactionHistory');

    // --- 定数・変数 ---
    const SHOP_ID = 'YanaharaSHOP001';
    const AUTO_DELAY = 2000; 
    const STORAGE_KEY = 'shop_history_data';

    let currentExpectedTransactionId = null;
    let shopVideoObj = null;
    let targetUserId = null;
    let autoTimer = null;
    let transactions = [];

    // --- 履歴管理 ---
    function loadHistory() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            transactions = JSON.parse(saved);
            transactions.forEach(t => renderHistoryItem(t));
        }
    }

    function saveAndRender(type, amount, userId) {
        const timeStr = new Date().toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'});
        const newTx = { type, amount, userId, time: timeStr };
        transactions.push(newTx);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
        renderHistoryItem(newTx);
    }

    function renderHistoryItem(t) {
        const li = document.createElement('li');
        li.style.padding = "12px"; li.style.borderBottom = "1px solid #eee"; li.style.listStyle = "none";
        const color = t.type === 'income' ? '#28a745' : '#dc3545';
        li.innerHTML = `<strong style="color:${color}">${t.type==='income'?'💰入金':'💸送金'}: ¥${parseInt(t.amount).toLocaleString()}</strong> <small>${t.time}</small><br><small>ID: ${t.userId}</small>`;
        shopTransactionHistoryEl.insertBefore(li, shopTransactionHistoryEl.firstChild);
    }

    function showSection(section) {
        if (autoTimer) clearTimeout(autoTimer);
        [mainShopSection, qrDisplaySection, shopScannerSection, remittanceAmountSection, paymentReceivedSection].forEach(sec => { if (sec) sec.classList.add('hidden'); });
        if (section) section.classList.remove('hidden');
    }

    // --- 支払い受付処理 (★連続支払い & 重複防止版) ---
    function startPayment(amount) {
        if (autoTimer) clearTimeout(autoTimer);
        
        // 1. 今回の決済専用IDを生成（これで古いデータとの混同を防ぐ）
        currentExpectedTransactionId = 'txn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const qrData = JSON.stringify({ shopId: SHOP_ID, amount: amount, transactionId: currentExpectedTransactionId });

        showSection(qrDisplaySection);
        qrCodeCanvas.innerHTML = '';
        new QRCode(qrCodeCanvas, { text: qrData, width: 200, height: 200 });
        
        // 2. 監視の再セットアップ
        database.ref('paymentStatuses').off(); // 前の客の監視をリセット

        database.ref('paymentStatuses').on('child_added', (snapshot) => {
            const data = snapshot.val();
            // IDが一致するか厳格にチェック
            if (data && data.transactionId === currentExpectedTransactionId) {
                database.ref('paymentStatuses').off(); // 自分の分を検知したら即座に解雇
                handlePaymentCompleted(data.customerId || 'Unknown', amount);
            }
        });
    }

    function handlePaymentCompleted(userId, amount) {
        saveAndRender('income', amount, userId);
        receivedAmountEl.textContent = `¥ ${parseInt(amount).toLocaleString()}`;
        receivedCustomerInfoEl.textContent = `User: ${userId}`;
        showSection(paymentReceivedSection);

        // ★重要：2秒後に「同じ金額」で自動的にQR生成画面へ戻る
        autoTimer = setTimeout(() => { 
            startPayment(amount); 
        }, AUTO_DELAY);
    }

    // --- ボタンイベント ---
    generateQrBtn.onclick = () => {
        const amount = paymentAmountInput.value;
        if (amount > 0) startPayment(amount);
    };

    resetAppBtn.onclick = () => { 
        database.ref('paymentStatuses').off(); 
        showSection(mainShopSection); 
    };

    backToMainFromShopCompletionBtn.onclick = () => {
        database.ref('paymentStatuses').off();
        showSection(mainShopSection);
    };

    // --- 送金カメラ等はそのまま ---
    function startShopQrReader() {
        showSection(shopScannerSection);
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
            shopVideoObj = stream; shopCameraVideo.srcObject = stream; shopCameraVideo.play(); requestAnimationFrame(tickShopQr);
        });
    }

    function tickShopQr() {
        if (shopCameraVideo.readyState === shopCameraVideo.HAVE_ENOUGH_DATA) {
            shopQrCanvas.height = shopCameraVideo.videoHeight; shopQrCanvas.width = shopCameraVideo.videoWidth;
            const ctx = shopQrCanvas.getContext("2d"); ctx.drawImage(shopCameraVideo, 0, 0, shopQrCanvas.width, shopQrCanvas.height);
            const code = jsQR(ctx.getImageData(0, 0, shopQrCanvas.width, shopQrCanvas.height).data, shopQrCanvas.width, shopQrCanvas.height);
            if (code && JSON.parse(code.data).type === 'receive_money') {
                stopCamera(); targetUserId = JSON.parse(code.data).userId;
                targetUserIdDisplay.textContent = targetUserId; showSection(remittanceAmountSection);
                return;
            }
        }
        if (shopVideoObj) requestAnimationFrame(tickShopQr);
    }

    function stopCamera() {
        if (shopVideoObj) { shopVideoObj.getTracks().forEach(t => t.stop()); shopVideoObj = null; }
    }

    confirmRemittanceBtn.onclick = async () => {
        const amount = parseInt(remittanceAmountInput.value);
        if (!amount || amount <= 0) return;
        try {
            const now = new Date().toISOString();
            await database.ref('paymentStatuses').push({
                amount: -amount, shopId: SHOP_ID, customerId: targetUserId, timestamp: now, transactionId: 'remit_' + Date.now()
            });
            await database.ref('remittances/' + targetUserId).push({ amount: amount, shopId: SHOP_ID, timestamp: now });
            saveAndRender('outgo', amount, targetUserId);
            showSection(mainShopSection);
        } catch (e) { alert(e.message); }
    };

    cancelRemittanceBtn.onclick = () => { stopCamera(); showSection(mainShopSection); };

    loadHistory();
});
