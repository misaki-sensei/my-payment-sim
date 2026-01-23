document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素 ---
    const mainShopSection = document.getElementById('mainShopSection');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const generateQrBtn = document.getElementById('generateQrBtn');
    
    const qrDisplaySection = document.getElementById('qrDisplaySection');
    const qrCodeCanvas = document.getElementById('qrCodeCanvas');
    const qrUrlText = document.getElementById('qrUrlText');
    const paymentStatusText = document.getElementById('paymentStatusMessage');
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

    const remittanceCompSection = document.getElementById('remittanceCompletionSection');
    const sentAmountDisplay = document.getElementById('sentAmountDisplay');
    const sentToUserDisplay = document.getElementById('sentToUserDisplay');
    const backToMainFromRemittanceBtn = document.getElementById('backToMainFromRemittanceBtn');

    const shopTransactionHistoryEl = document.getElementById('shopTransactionHistory');

    // --- 定数・変数 ---
    const SHOP_ID = 'YanaharaSHOP001';
    const AUTO_DELAY = 2000;
    const STORAGE_KEY = 'shop_history_data';

    let currentExpectedTransactionId = null;
    let paymentStatusListener = null;
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
        li.style.display = "flex"; li.style.flexDirection = "column";
        const color = t.type === 'income' ? '#28a745' : '#dc3545';
        const label = t.type === 'income' ? '💰 入金' : '💸 送金';
        li.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="color: ${color}; font-size: 1.1em;">${label}: ¥${parseInt(t.amount).toLocaleString()}</strong>
                <span style="font-size: 0.8em; color: #888;">${t.time}</span>
            </div>
            <div style="font-size: 0.82em; color: #666; margin-top: 5px; word-break: break-all; background: #f9f9f9; padding: 4px 8px; border-radius: 4px;">
                ID: ${t.userId}
            </div>
        `;
        shopTransactionHistoryEl.insertBefore(li, shopTransactionHistoryEl.firstChild);
    }

    function showSection(section) {
        if (autoTimer) clearTimeout(autoTimer);
        const allSections = [mainShopSection, qrDisplaySection, shopScannerSection, remittanceAmountSection, paymentReceivedSection, remittanceCompSection];
        allSections.forEach(sec => { if (sec) sec.classList.add('hidden'); });
        if (section) section.classList.remove('hidden');
    }

    // --- 支払い受付処理 ---
    function startPayment(amount) {
        currentExpectedTransactionId = 'txn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const qrData = JSON.stringify({ shopId: SHOP_ID, amount: amount, transactionId: currentExpectedTransactionId });

        // GASが paymentStatuses を監視しているため、ここにリクエストを作成
        database.ref('payment_requests/' + currentExpectedTransactionId).set({
            shopId: SHOP_ID, amount: amount, status: 'pending', timestamp: new Date().toISOString()
        });

        showSection(qrDisplaySection);
        qrCodeCanvas.innerHTML = '';
        new QRCode(qrCodeCanvas, { text: qrData, width: 200, height: 200 });
        
        // 監視パスの修正: GASが消去する可能性があるため、お客側の書き込み先と合わせます
        if (paymentStatusListener) database.ref('paymentStatuses').off();
        paymentStatusListener = database.ref('paymentStatuses').on('child_added', (snapshot) => {
            const data = snapshot.val();
            // 自分の発行した金額と一致するか確認（簡易照合）
            if (data && data.shopId === SHOP_ID && parseInt(data.amount) === parseInt(amount)) {
                handlePaymentCompleted(data.customerId || 'Unknown', amount);
            }
        });
    }

    function handlePaymentCompleted(userId, amount) {
        if (paymentStatusListener) database.ref('paymentStatuses').off();
        saveAndRender('income', amount, userId);
        receivedAmountEl.textContent = `¥ ${parseInt(amount).toLocaleString()}`;
        receivedCustomerInfoEl.textContent = `User: ${userId}`;
        showSection(paymentReceivedSection);
        autoTimer = setTimeout(() => { if (!paymentReceivedSection.classList.contains('hidden')) startPayment(amount); }, AUTO_DELAY);
    }

    // --- 送金カメラ処理 ---
    function startShopQrReader() {
        showSection(shopScannerSection);
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(function(stream) {
            shopVideoObj = stream; shopCameraVideo.srcObject = stream; shopCameraVideo.play(); requestAnimationFrame(tickShopQr);
        }).catch(function(err) { alert("カメラ起動失敗"); showSection(mainShopSection); });
    }

    function tickShopQr() {
        if (shopCameraVideo.readyState === shopCameraVideo.HAVE_ENOUGH_DATA) {
            shopQrCanvas.height = shopCameraVideo.videoHeight; shopQrCanvas.width = shopCameraVideo.videoWidth;
            const ctx = shopQrCanvas.getContext("2d"); ctx.drawImage(shopCameraVideo, 0, 0, shopQrCanvas.width, shopQrCanvas.height);
            const code = jsQR(ctx.getImageData(0, 0, shopQrCanvas.width, shopQrCanvas.height).data, shopQrCanvas.width, shopQrCanvas.height);
            if (code) {
                try {
                    const data = JSON.parse(code.data);
                    if (data.type === 'receive_money' && data.userId) {
                        if (shopVideoObj) shopVideoObj.getTracks().forEach(track => track.stop());
                        shopVideoObj = null; targetUserId = data.userId;
                        targetUserIdDisplay.textContent = targetUserId; showSection(remittanceAmountSection);
                        return;
                    }
                } catch (e) {}
            }
        }
        if (shopVideoObj) requestAnimationFrame(tickShopQr);
    }

    // --- イベントリスナー ---
    generateQrBtn.onclick = () => {
        const amount = paymentAmountInput.value;
        if (!amount || amount <= 0) return alert("金額を入力してください");
        startPayment(amount);
    };

    startRemittanceBtn.onclick = startShopQrReader;
    cancelRemittanceBtn.onclick = () => { if (shopVideoObj) shopVideoObj.getTracks().forEach(track => track.stop()); shopVideoObj = null; showSection(mainShopSection); };
    backToScanBtn.onclick = startShopQrReader;

    confirmRemittanceBtn.onclick = async () => {
        const amount = parseInt(remittanceAmountInput.value);
        if (!amount || amount <= 0) return alert('金額を入力');
        if (!confirm(`${amount}円を送金しますか？`)) return;

        try {
            const now = new Date().toISOString();
            // 1. スプレッドシート連携用パス(paymentStatuses)にマイナス金額で送る
            await database.ref('paymentStatuses').push({
                amount: -amount, shopId: SHOP_ID, customerId: targetUserId, timestamp: now
            });

            // 2. 本来の送金パスにも保存
            await database.ref('remittances/' + targetUserId).push({ amount: amount, shopId: SHOP_ID, timestamp: now });

            saveAndRender('outgo', amount, targetUserId);
            sentAmountDisplay.textContent = `¥ ${amount.toLocaleString()}`;
            sentToUserDisplay.textContent = `宛先ID: ${targetUserId}`;
            showSection(remittanceCompSection);
            autoTimer = setTimeout(() => { if (!remittanceCompSection.classList.contains('hidden')) showSection(mainShopSection); }, AUTO_DELAY);
        } catch (e) { alert('失敗: ' + e.message); }
    };

    resetAppBtn.onclick = () => showSection(mainShopSection);
    backToMainFromShopCompletionBtn.onclick = () => showSection(mainShopSection);
    if (backToMainFromRemittanceBtn) backToMainFromRemittanceBtn.onclick = () => showSection(mainShopSection);

    loadHistory();
});
