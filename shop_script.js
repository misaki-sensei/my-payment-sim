document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素 ---
    const mainShopSection = document.getElementById('mainShopSection');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const generateQrBtn = document.getElementById('generateQrBtn');
    
    // 支払いQR表示関連
    const qrDisplaySection = document.getElementById('qrDisplaySection');
    const qrCodeCanvas = document.getElementById('qrCodeCanvas');
    const qrUrlText = document.getElementById('qrUrlText');
    const paymentStatusText = document.getElementById('paymentStatusMessage');
    const resetAppBtn = document.getElementById('resetAppBtn');

    // 送金関連
    const startRemittanceBtn = document.getElementById('startRemittanceBtn');
    const shopScannerSection = document.getElementById('shopScannerSection');
    const shopCameraVideo = document.getElementById('shopCameraVideo');
    const shopQrCanvas = document.getElementById('shopQrCanvas');
    const cancelRemittanceBtn = document.getElementById('cancelRemittanceBtn');
    const remittanceAmountSection = document.getElementById('remittanceAmountSection');
    const targetUserIdDisplay = document.getElementById('targetUserIdDisplay');
    const remittanceAmountInput = document.getElementById('remittanceAmountInput');
    const confirmRemittanceBtn = document.getElementById('confirmRemittanceBtn');
    const backToScanBtn = document.getElementById('backToScanBtn');

    // 入金完了画面
    const paymentReceivedSection = document.getElementById('paymentReceivedSection');
    const receivedAmountEl = document.getElementById('receivedAmount');
    const receivedCustomerInfoEl = document.getElementById('receivedCustomerInfo');
    const backToMainFromShopCompletionBtn = document.getElementById('backToMainFromShopCompletionBtn');

    // 送金完了画面 (新規追加分)
    const remittanceCompSection = document.getElementById('remittanceCompletionSection');
    const sentAmountDisplay = document.getElementById('sentAmountDisplay');
    const sentToUserDisplay = document.getElementById('sentToUserDisplay');
    const backToMainFromRemittanceBtn = document.getElementById('backToMainFromRemittanceBtn');

    // 履歴
    const shopTransactionHistoryEl = document.getElementById('shopTransactionHistory');

    // --- 定数・変数 ---
    const SHOP_ID = 'YanaharaSHOP001';
    const AUTO_CLOSE_DELAY = 3000;      // 完了画面の表示時間 (3秒)
    const AUTO_REGENERATE_DELAY = 2000; // 連続支払いの待機時間 (2秒)
    
    let currentExpectedTransactionId = null;
    let paymentStatusListener = null;
    let shopVideoObj = null;
    let targetUserId = null;
    let autoTimer = null; // 自動遷移タイマー保持用

    // --- 関数: 画面切り替え ---
    function showSection(section) {
        // タイマーが動いていればクリア（手動操作優先）
        if (autoTimer) clearTimeout(autoTimer);

        const allSections = [
            mainShopSection, qrDisplaySection, shopScannerSection, 
            remittanceAmountSection, paymentReceivedSection, remittanceCompSection
        ];
        allSections.forEach(sec => {
            if (sec) sec.classList.add('hidden');
        });
        if (section) section.classList.remove('hidden');
    }

    // --- 支払い処理 (QR生成 & 監視) ---
    function startPayment(amount) {
        currentExpectedTransactionId = 'txn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        
        const qrData = JSON.stringify({
            shopId: SHOP_ID,
            amount: amount,
            transactionId: currentExpectedTransactionId
        });

        // Firebaseに支払い待ちリクエストを作成
        database.ref('payment_requests/' + currentExpectedTransactionId).set({
            shopId: SHOP_ID,
            amount: amount,
            status: 'pending',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        showSection(qrDisplaySection);
        qrCodeCanvas.innerHTML = '';
        new QRCode(qrCodeCanvas, { text: qrData, width: 200, height: 200 });
        
        if(qrUrlText) qrUrlText.textContent = `ID: ${currentExpectedTransactionId}`;
        if(paymentStatusText) {
            paymentStatusText.innerHTML = '<span class="icon">⏳</span> 顧客からの支払い待ち...';
            paymentStatusText.className = 'status-pending';
        }

        // 監視開始
        if (paymentStatusListener) {
            database.ref('payment_status/' + currentExpectedTransactionId).off();
        }
        
        paymentStatusListener = database.ref('payment_status/' + currentExpectedTransactionId).on('value', (snapshot) => {
            const statusData = snapshot.val();
            if (statusData && statusData.status === 'completed') {
                handlePaymentCompleted(statusData.userId, amount);
            }
        });
    }

    function handlePaymentCompleted(userId, amount) {
        database.ref('payment_status/' + currentExpectedTransactionId).off();
        
        // 履歴追加
        const li = document.createElement('li');
        li.className = 'payment';
        li.innerHTML = `<span>💰 入金: ${parseInt(amount).toLocaleString()}円</span><span>User: ${userId.substr(0,6)}...</span>`;
        shopTransactionHistoryEl.insertBefore(li, shopTransactionHistoryEl.firstChild);

        receivedAmountEl.textContent = `¥ ${parseInt(amount).toLocaleString()}`;
        receivedCustomerInfoEl.textContent = `User: ${userId}`;
        showSection(paymentReceivedSection);

        // ★連続支払い: 2秒後に自動で同じ金額のQRを出す
        autoTimer = setTimeout(() => {
            if (paymentReceivedSection.classList.contains('hidden')) return;
            startPayment(amount);
        }, AUTO_REGENERATE_DELAY);
    }

    // --- 送金処理 (カメラ & 実行) ---
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

    function stopShopQrReader() {
        if (shopVideoObj) {
            shopVideoObj.getTracks().forEach(track => track.stop());
            shopVideoObj = null;
        }
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
                        stopShopQrReader();
                        targetUserId = data.userId;
                        targetUserIdDisplay.textContent = targetUserId;
                        remittanceAmountInput.value = '';
                        showSection(remittanceAmountSection);
                        return;
                    }
                } catch (e) {}
            }
        }
        if (shopVideoObj) requestAnimationFrame(tickShopQr);
    }

    // --- イベントリスナー ---

    // 支払い開始
    generateQrBtn.addEventListener('click', () => {
        const amount = paymentAmountInput.value;
        if (!amount || amount <= 0) return alert("金額を入力してください");
        startPayment(amount);
    });

    // 送金開始
    startRemittanceBtn.addEventListener('click', startShopQrReader);
    cancelRemittanceBtn.addEventListener('click', () => { stopShopQrReader(); showSection(mainShopSection); });
    backToScanBtn.addEventListener('click', startShopQrReader);

    // 送金確定
    confirmRemittanceBtn.addEventListener('click', async () => {
        const amount = parseInt(remittanceAmountInput.value);
        if (!amount || amount <= 0) return alert('金額を入力してください');
        if (!confirm(`${amount}円を送金しますか？`)) return;

        try {
            await database.ref('remittances/' + targetUserId).push({
                amount: amount,
                shopId: SHOP_ID,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });

            // 履歴追加
            const li = document.createElement('li');
            li.style.color = 'red';
            li.innerHTML = `<span>💸 送金: -${amount.toLocaleString()}円</span><span>To: ${targetUserId.substr(0,6)}...</span>`;
            shopTransactionHistoryEl.insertBefore(li, shopTransactionHistoryEl.firstChild);

            // 完了画面の表示
            sentAmountDisplay.textContent = `¥ ${amount.toLocaleString()}`;
            sentToUserDisplay.textContent = `宛先ID: ${targetUserId}`;
            showSection(remittanceCompSection);

            // ★送金完了: 3秒後にメイン画面へ戻る
            autoTimer = setTimeout(() => {
                if (!remittanceCompSection.classList.contains('hidden')) {
                    showSection(mainShopSection);
                }
            }, AUTO_CLOSE_DELAY);

        } catch (e) {
            alert('送金失敗: ' + e.message);
        }
    });

    // 戻る・リセット系
    resetAppBtn.addEventListener('click', () => {
        if (currentExpectedTransactionId) database.ref('payment_status/' + currentExpectedTransactionId).off();
        showSection(mainShopSection);
    });

    backToMainFromShopCompletionBtn.addEventListener('click', () => showSection(mainShopSection));
    
    if (backToMainFromRemittanceBtn) {
        backToMainFromRemittanceBtn.addEventListener('click', () => showSection(mainShopSection));
    }
});
