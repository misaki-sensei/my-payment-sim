document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素 ---
    const mainShopSection = document.getElementById('mainShopSection');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const generateQrBtn = document.getElementById('generateQrBtn');
    
    const qrDisplaySection = document.getElementById('qrDisplaySection');
    const qrCodeCanvas = document.getElementById('qrCodeCanvas');
    const paymentStatusMessage = document.getElementById('paymentStatusMessage');
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
    const AUTO_DELAY = 2000; // 2秒
    const STORAGE_KEY = 'shop_history_data';

    let currentExpectedTransactionId = null;
    let shopVideoObj = null;
    let targetUserId = null;
    let autoTimer = null;
    let transactions = [];

    // --- 履歴保存・LocalStorage ---
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
        const label = t.type === 'income' ? '💰 入金' : '💸 送金';
        li.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:${color}; font-size:1.1em;">${label}: ¥${parseInt(t.amount).toLocaleString()}</strong>
                <span style="font-size:0.8em; color:#888;">${t.time}</span>
            </div>
            <div style="font-size:0.82em; color:#666; margin-top:5px; background:#f9f9f9; padding:4px; border-radius:4px;">
                ID: ${t.userId}
            </div>
        `;
        shopTransactionHistoryEl.insertBefore(li, shopTransactionHistoryEl.firstChild);
    }

    function showSection(section) {
        if (autoTimer) clearTimeout(autoTimer);
        const allSections = [mainShopSection, qrDisplaySection, shopScannerSection, remittanceAmountSection, paymentReceivedSection];
        allSections.forEach(sec => { if (sec) sec.classList.add('hidden'); });
        if (section) section.classList.remove('hidden');
    }

    // --- 支払い受付処理 (★重複防止対策) ---
    function startPayment(amount) {
        if (autoTimer) clearTimeout(autoTimer);
        
        currentExpectedTransactionId = 'txn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const qrData = JSON.stringify({ shopId: SHOP_ID, amount: amount, transactionId: currentExpectedTransactionId });

        // Firebaseに通知
        database.ref('payment_requests/' + currentExpectedTransactionId).set({
            shopId: SHOP_ID, amount: amount, status: 'pending', timestamp: new Date().toISOString()
        });

        showSection(qrDisplaySection);
        qrCodeCanvas.innerHTML = '';
        new QRCode(qrCodeCanvas, { text: qrData, width: 200, height: 200 });
        
        // 【重要】新しい監視を始める前に、以前の監視をすべて解除する
        database.ref('paymentStatuses').off();

        // 支払い完了の監視開始
        database.ref('paymentStatuses').on('child_added', (snapshot) => {
            const data = snapshot.val();
            // 金額と店舗IDが自分の出したQRと一致するか
            if (data && data.shopId === SHOP_ID && parseInt(data.amount) === parseInt(amount)) {
                // 一致した瞬間に監視を解除（これで5連続などの重複を防ぐ）
                database.ref('paymentStatuses').off();
                handlePaymentCompleted(data.customerId || 'Unknown', amount);
            }
        });
    }

    function handlePaymentCompleted(userId, amount) {
        // 念のためここでも監視を止める
        database.ref('paymentStatuses').off();

        saveAndRender('income', amount, userId);
        receivedAmountEl.textContent = `¥ ${parseInt(amount).toLocaleString()}`;
        receivedCustomerInfoEl.textContent = `User: ${userId}`;
        showSection(paymentReceivedSection);

        // 2秒後に自動でQR画面に戻る（連続支払い対応）
        autoTimer = setTimeout(() => { 
            if (!paymentReceivedSection.classList.contains('hidden')) {
                startPayment(amount); 
            }
        }, AUTO_DELAY);
    }

    // --- 送金カメラ処理 ---
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
            if (code) {
                const data = JSON.parse(code.data);
                if (data.type === 'receive_money' && data.userId) {
                    stopCamera(); targetUserId = data.userId;
                    targetUserIdDisplay.textContent = targetUserId; showSection(remittanceAmountSection);
                    return;
                }
            }
        }
        if (shopVideoObj) requestAnimationFrame(tickShopQr);
    }

    function stopCamera() {
        if (shopVideoObj) { shopVideoObj.getTracks().forEach(t => t.stop()); shopVideoObj = null; }
    }

    // --- ボタンイベント ---
    generateQrBtn.onclick = () => {
        const amount = paymentAmountInput.value;
        if (!amount || amount <= 0) return alert("金額を入力してください");
        startPayment(amount);
    };

    confirmRemittanceBtn.onclick = async () => {
        const amount = parseInt(remittanceAmountInput.value);
        if (!amount || amount <= 0) return alert('金額を入力');
        try {
            const now = new Date().toISOString();
            // スプレッドシート連携用(paymentStatuses)にマイナス金額で送る
            await database.ref('paymentStatuses').push({
                amount: -amount, shopId: SHOP_ID, customerId: targetUserId, timestamp: now
            });
            // 送金実行
            await database.ref('remittances/' + targetUserId).push({ amount: amount, shopId: SHOP_ID, timestamp: now });
            saveAndRender('outgo', amount, targetUserId);
            alert("送金完了しました");
            showSection(mainShopSection);
        } catch (e) { alert('失敗: ' + e.message); }
    };

    resetAppBtn.onclick = () => { database.ref('paymentStatuses').off(); showSection(mainShopSection); };
    backToMainFromShopCompletionBtn.onclick = () => showSection(mainShopSection);
    cancelRemittanceBtn.onclick = () => { stopCamera(); showSection(mainShopSection); };

    loadHistory();
});
