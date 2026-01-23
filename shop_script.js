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
    const AUTO_DELAY = 2000; // すべて2秒に統一
    const STORAGE_KEY = 'shop_history_data'; // LocalStorage保存用キー

    let currentExpectedTransactionId = null;
    let paymentStatusListener = null;
    let shopVideoObj = null;
    let targetUserId = null;
    let autoTimer = null;
    let transactions = []; // 履歴データ

    // --- 関数: 履歴の保存と描画 (LocalStorage対応) ---
    function loadHistory() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            transactions = JSON.parse(saved);
            // 保存されている履歴を古い順から新しい順に描画
            transactions.forEach(t => renderHistoryItem(t));
        }
    }

    function saveAndRender(type, amount, userId) {
        const timeStr = new Date().toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'});
        const newTx = { type, amount, userId, time: timeStr };
        
        // データを保存
        transactions.push(newTx);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
        
        // 画面に描画
        renderHistoryItem(newTx);
    }

    function renderHistoryItem(t) {
        const li = document.createElement('li');
        li.style.padding = "12px";
        li.style.borderBottom = "1px solid #eee";
        li.style.listStyle = "none";
        li.style.display = "flex";
        li.style.flexDirection = "column";

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

    // --- 関数: 画面切り替え ---
    function showSection(section) {
        if (autoTimer) clearTimeout(autoTimer);
        const allSections = [
            mainShopSection, qrDisplaySection, shopScannerSection, 
            remittanceAmountSection, paymentReceivedSection, remittanceCompSection
        ];
        allSections.forEach(sec => { if (sec) sec.classList.add('hidden'); });
        if (section) section.classList.remove('hidden');
    }

    // --- 支払い処理 (入金) ---
    function startPayment(amount) {
        currentExpectedTransactionId = 'txn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const qrData = JSON.stringify({ shopId: SHOP_ID, amount: amount, transactionId: currentExpectedTransactionId });

        database.ref('payment_requests/' + currentExpectedTransactionId).set({
            shopId: SHOP_ID, amount: amount, status: 'pending', timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        showSection(qrDisplaySection);
        qrCodeCanvas.innerHTML = '';
        new QRCode(qrCodeCanvas, { text: qrData, width: 200, height: 200 });
        
        if(paymentStatusText) {
            paymentStatusText.innerHTML = '⏳ 顧客からの支払い待ち...';
            paymentStatusText.className = 'status-pending';
        }

        if (paymentStatusListener) database.ref('payment_status/' + currentExpectedTransactionId).off();
        paymentStatusListener = database.ref('payment_status/' + currentExpectedTransactionId).on('value', (snapshot) => {
            const statusData = snapshot.val();
            if (statusData && statusData.status === 'completed') {
                handlePaymentCompleted(statusData.userId, amount);
            }
        });
    }

    function handlePaymentCompleted(userId, amount) {
        database.ref('payment_status/' + currentExpectedTransactionId).off();
        
        // 履歴保存＆描画
        saveAndRender('income', amount, userId);

        receivedAmountEl.textContent = `¥ ${parseInt(amount).toLocaleString()}`;
        receivedCustomerInfoEl.textContent = `User: ${userId}`;
        showSection(paymentReceivedSection);

        // 2秒後に連続支払い用QRを再生成
        autoTimer = setTimeout(() => {
            if (!paymentReceivedSection.classList.contains('hidden')) startPayment(amount);
        }, AUTO_DELAY);
    }

    // --- 送金処理 (出金) ---
    function startShopQrReader() {
        showSection(shopScannerSection);
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(function(stream) {
                shopVideoObj = stream;
                shopCameraVideo.srcObject = stream;
                shopCameraVideo.play();
                requestAnimationFrame(tickShopQr);
            })
            .catch(function(err) {
                alert("カメラを起動できませんでした");
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
                        if (shopVideoObj) shopVideoObj.getTracks().forEach(track => track.stop());
                        shopVideoObj = null;
                        targetUserId = data.userId;
                        targetUserIdDisplay.textContent = targetUserId;
                        showSection(remittanceAmountSection);
                        return;
                    }
                } catch (e) {}
            }
        }
        if (shopVideoObj) requestAnimationFrame(tickShopQr);
    }

    // --- イベントリスナー ---
    generateQrBtn.addEventListener('click', () => {
        const amount = paymentAmountInput.value;
        if (!amount || amount <= 0) return alert("金額を入力してください");
        startPayment(amount);
    });

    startRemittanceBtn.addEventListener('click', startShopQrReader);
    cancelRemittanceBtn.addEventListener('click', () => { 
        if (shopVideoObj) shopVideoObj.getTracks().forEach(track => track.stop());
        shopVideoObj = null;
        showSection(mainShopSection); 
    });

    backToScanBtn.addEventListener('click', startShopQrReader);

    confirmRemittanceBtn.addEventListener('click', async () => {
        const amount = parseInt(remittanceAmountInput.value);
        if (!amount || amount <= 0) return alert('金額を入力してください');
        if (!confirm(`${amount}円を送金しますか？`)) return;

        try {
            await database.ref('remittances/' + targetUserId).push({
                amount: amount, shopId: SHOP_ID, timestamp: firebase.database.ServerValue.TIMESTAMP
            });

            // 履歴保存＆描画
            saveAndRender('outgo', amount, targetUserId);

            sentAmountDisplay.textContent = `¥ ${amount.toLocaleString()}`;
            sentToUserDisplay.textContent = `宛先ID: ${targetUserId}`;
            showSection(remittanceCompSection);

            // 2秒後にメインへ
            autoTimer = setTimeout(() => {
                if (!remittanceCompSection.classList.contains('hidden')) showSection(mainShopSection);
            }, AUTO_DELAY);
        } catch (e) { alert('送金失敗: ' + e.message); }
    });

    // 画面遷移・リセットボタン
    resetAppBtn.addEventListener('click', () => showSection(mainShopSection));
    backToMainFromShopCompletionBtn.addEventListener('click', () => showSection(mainShopSection));
    if (backToMainFromRemittanceBtn) backToMainFromRemittanceBtn.addEventListener('click', () => showSection(mainShopSection));

    // 起動時にLocalStorageから履歴を読み込む
    loadHistory();
});
