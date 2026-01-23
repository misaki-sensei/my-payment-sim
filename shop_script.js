document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素 ---
    const mainShopSection = document.getElementById('mainShopSection');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const generateQrBtn = document.getElementById('generateQrBtn');
    
    // 送金開始ボタン（HTML側のIDがこれであることを確認してください）
    const startShopScannerBtn = document.getElementById('showShopScannerBtn') || document.getElementById('startShopScannerBtn');

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
        li.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <strong style="color:${color}">${t.type==='income'?'💰入金':'💸送金'}: ¥${parseInt(t.amount).toLocaleString()}</strong>
                <span style="font-size:0.8em; color:#888;">${t.time}</span>
            </div>
            <div style="font-size:0.8em; color:#666;">ID: ${t.userId}</div>
        `;
        shopTransactionHistoryEl.insertBefore(li, shopTransactionHistoryEl.firstChild);
    }

    function showSection(section) {
        if (autoTimer) clearTimeout(autoTimer);
        const allSections = [mainShopSection, qrDisplaySection, shopScannerSection, remittanceAmountSection, paymentReceivedSection];
        allSections.forEach(sec => { if (sec) sec.classList.add('hidden'); });
        if (section) section.classList.remove('hidden');
    }

    // --- 支払い受付処理 (連続支払い対応) ---
    function startPayment(amount) {
        if (autoTimer) clearTimeout(autoTimer);
        
        // 毎回新しいTransactionIDを発行して古いデータと区別する
        currentExpectedTransactionId = 'txn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const qrData = JSON.stringify({ shopId: SHOP_ID, amount: amount, transactionId: currentExpectedTransactionId });

        showSection(qrDisplaySection);
        qrCodeCanvas.innerHTML = '';
        new QRCode(qrCodeCanvas, { text: qrData, width: 200, height: 200 });
        
        // 監視のリセット
        database.ref('paymentStatuses').off();

        // 監視開始
        database.ref('paymentStatuses').on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (data && data.transactionId === currentExpectedTransactionId) {
                database.ref('paymentStatuses').off(); // 検知したら即解除
                handlePaymentCompleted(data.customerId || 'Unknown', amount);
            }
        });
    }

    function handlePaymentCompleted(userId, amount) {
        saveAndRender('income', amount, userId);
        receivedAmountEl.textContent = `¥ ${parseInt(amount).toLocaleString()}`;
        receivedCustomerInfoEl.textContent = `User: ${userId}`;
        showSection(paymentReceivedSection);

        // ★2秒後に自動で同じ金額のQR表示に戻る（連続支払いループ）
        autoTimer = setTimeout(() => { 
            startPayment(amount); 
        }, AUTO_DELAY);
    }

    // --- 送金カメラ処理 (★ここが修正ポイント) ---
    function startShopQrReader() {
        showSection(shopScannerSection);
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(stream => {
                shopVideoObj = stream;
                shopCameraVideo.srcObject = stream;
                shopCameraVideo.setAttribute("playsinline", true);
                shopCameraVideo.play();
                requestAnimationFrame(tickShopQr);
            })
            .catch(err => alert("カメラを起動できません: " + err));
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
                    if (data.type === 'receive_money' && data.userId) {
                        stopCamera();
                        targetUserId = data.userId;
                        targetUserIdDisplay.textContent = targetUserId;
                        showSection(remittanceAmountSection);
                        return;
                    }
                } catch(e) { /* JSONでないQRは無視 */ }
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

    // --- ボタンイベント登録 ---
    
    // 入金QR作成
    generateQrBtn.onclick = () => {
        const amount = paymentAmountInput.value;
        if (amount > 0) startPayment(amount);
        else alert("金額を入力してください");
    };

    // 送金スキャン開始 (HTMLのボタンIDに合わせて設定)
    if (startShopScannerBtn) {
        startShopScannerBtn.onclick = () => startShopQrReader();
    }

    // 送金実行ボタン
    confirmRemittanceBtn.onclick = async () => {
        const amount = parseInt(remittanceAmountInput.value);
        if (!amount || amount <= 0) return alert("金額を入力してください");
        
        try {
            const now = new Date().toISOString();
            // 1. スプレッドシート連携用(マイナス表記)
            await database.ref('paymentStatuses').push({
                amount: -amount, shopId: SHOP_ID, customerId: targetUserId, timestamp: now, transactionId: 'remit_' + Date.now()
            });
            // 2. 相手への送金
            await database.ref('remittances/' + targetUserId).push({ 
                amount: amount, shopId: SHOP_ID, timestamp: now 
            });

            saveAndRender('outgo', amount, targetUserId);
            alert("送金完了しました");
            showSection(mainShopSection);
        } catch (e) { alert("エラー: " + e.message); }
    };

    // リセット・戻るボタン
    resetAppBtn.onclick = () => { database.ref('paymentStatuses').off(); showSection(mainShopSection); };
    backToMainFromShopCompletionBtn.onclick = () => { database.ref('paymentStatuses').off(); showSection(mainShopSection); };
    cancelRemittanceBtn.onclick = () => { stopCamera(); showSection(mainShopSection); };

    loadHistory();
});
