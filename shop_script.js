document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得（IDが違っても探せるように予備を準備） ---
    const getEl = (id) => document.getElementById(id);

    const mainShopSection = getEl('mainShopSection');
    const paymentAmountInput = getEl('paymentAmount');
    const generateQrBtn = getEl('generateQrBtn');
    
    // 送金開始ボタン：複数の可能性のあるIDすべてに対応
    const startShopScannerBtn = getEl('showShopScannerBtn') || getEl('startShopScannerBtn') || getEl('btnStartScanner');

    const qrDisplaySection = getEl('qrDisplaySection');
    const qrCodeCanvas = getEl('qrCodeCanvas');
    const resetAppBtn = getEl('resetAppBtn');

    const shopScannerSection = getEl('shopScannerSection');
    const shopCameraVideo = getEl('shopCameraVideo');
    const shopQrCanvas = getEl('shopQrCanvas');
    const cancelRemittanceBtn = getEl('cancelRemittanceBtn');
    
    const remittanceAmountSection = getEl('remittanceAmountSection');
    const targetUserIdDisplay = getEl('targetUserIdDisplay');
    const remittanceAmountInput = getEl('remittanceAmountInput');
    const confirmRemittanceBtn = getEl('confirmRemittanceBtn');

    const paymentReceivedSection = getEl('paymentReceivedSection');
    const receivedAmountEl = getEl('receivedAmount');
    const receivedCustomerInfoEl = getEl('receivedCustomerInfo');
    const backToMainFromShopCompletionBtn = getEl('backToMainFromShopCompletionBtn');

    const shopTransactionHistoryEl = getEl('shopTransactionHistory');

    // --- 定数・変数 ---
    const SHOP_ID = 'YanaharaSHOP001';
    const AUTO_DELAY = 2000; 
    const STORAGE_KEY = 'shop_history_data';

    let currentExpectedTransactionId = null;
    let shopVideoObj = null;
    let targetUserId = null;
    let autoTimer = null;
    let transactions = [];

    // --- 履歴管理関数 ---
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
        li.style.padding = "10px"; li.style.borderBottom = "1px solid #eee";
        const color = t.type === 'income' ? '#28a745' : '#dc3545';
        li.innerHTML = `<strong style="color:${color}">${t.type==='income'?'💰入金':'💸送金'}: ¥${parseInt(t.amount).toLocaleString()}</strong> <small>${t.time}</small>`;
        if (shopTransactionHistoryEl) shopTransactionHistoryEl.insertBefore(li, shopTransactionHistoryEl.firstChild);
    }

    function showSection(section) {
        if (autoTimer) clearTimeout(autoTimer);
        [mainShopSection, qrDisplaySection, shopScannerSection, remittanceAmountSection, paymentReceivedSection].forEach(sec => { if (sec) sec.classList.add('hidden'); });
        if (section) section.classList.remove('hidden');
    }

    // --- 支払い受付処理（連続支払い） ---
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

    // --- 送金カメラ処理 ---
    function startShopQrReader() {
        console.log("カメラ起動を試みます...");
        showSection(shopScannerSection);
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(stream => {
                shopVideoObj = stream;
                shopCameraVideo.srcObject = stream;
                shopCameraVideo.play();
                requestAnimationFrame(tickShopQr);
            })
            .catch(err => {
                alert("カメラ起動エラー: " + err.name);
                showSection(mainShopSection);
            });
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

    // --- ボタンイベントの割り当て ---

    // 入金QRボタン
    if (generateQrBtn) {
        generateQrBtn.onclick = () => {
            const amount = paymentAmountInput.value;
            if (amount > 0) startPayment(amount);
            else alert("金額を入力してください");
        };
    }

    // 送金開始ボタン（ここが重要！）
    if (startShopScannerBtn) {
        startShopScannerBtn.onclick = () => {
            console.log("送金ボタンがクリックされました");
            startShopQrReader();
        };
    } else {
        console.error("送金開始ボタンが見つかりません。IDを確認してください。");
    }

    // 送金実行ボタン
    if (confirmRemittanceBtn) {
        confirmRemittanceBtn.onclick = async () => {
            const amount = parseInt(remittanceAmountInput.value);
            if (!amount || amount <= 0) return alert("金額を入力");
            try {
                const now = new Date().toISOString();
                await database.ref('paymentStatuses').push({
                    amount: -amount, shopId: SHOP_ID, customerId: targetUserId, timestamp: now, transactionId: 'remit_' + Date.now()
                });
                await database.ref('remittances/' + targetUserId).push({ 
                    amount: amount, shopId: SHOP_ID, timestamp: now 
                });
                saveAndRender('outgo', amount, targetUserId);
                alert("送金完了しました");
                showSection(mainShopSection);
            } catch (e) { alert("送金失敗: " + e.message); }
        };
    }

    // キャンセル・戻る系
    if (resetAppBtn) resetAppBtn.onclick = () => showSection(mainShopSection);
    if (backToMainFromShopCompletionBtn) backToMainFromShopCompletionBtn.onclick = () => showSection(mainShopSection);
    if (cancelRemittanceBtn) cancelRemittanceBtn.onclick = () => { stopCamera(); showSection(mainShopSection); };

    loadHistory();
});
