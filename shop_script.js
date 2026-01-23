document.addEventListener('DOMContentLoaded', () => {
    // DOM要素
    const mainShopSection = document.getElementById('mainShopSection');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const generateQrBtn = document.getElementById('generateQrBtn');
    
    const qrDisplaySection = document.getElementById('qrDisplaySection');
    const qrCodeCanvas = document.getElementById('qrCodeCanvas');
    const qrUrlText = document.getElementById('qrUrlText');
    const paymentStatusText = document.getElementById('paymentStatusMessage');
    const resetAppBtn = document.getElementById('resetAppBtn');
    
    const shopTransactionHistoryEl = document.getElementById('shopTransactionHistory');
    
    const paymentReceivedSection = document.getElementById('paymentReceivedSection');
    const receivedAmountEl = document.getElementById('receivedAmount');
    const receivedCustomerInfoEl = document.getElementById('receivedCustomerInfo');
    const backToMainFromShopCompletionBtn = document.getElementById('backToMainFromShopCompletionBtn');

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

    // 定数・変数
    const SHOP_ID = 'YanaharaSHOP001';
    let currentTransactionId = null;
    let listener = null;
    let shopVideoObj = null;
    let targetUserId = null;

    function showSection(target) {
        [mainShopSection, qrDisplaySection, shopScannerSection, remittanceAmountSection, paymentReceivedSection].forEach(s => s.classList.add('hidden'));
        target.classList.remove('hidden');
    }

    // 支払いQR作成
    generateQrBtn.addEventListener('click', () => {
        const amount = paymentAmountInput.value;
        if (!amount || amount <= 0) return alert('金額を入力してください');
        
        currentTransactionId = 'txn_' + Date.now();
        database.ref('payment_requests/' + currentTransactionId).set({
            shopId: SHOP_ID, amount: amount, status: 'pending', timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        showSection(qrDisplaySection);
        qrCodeCanvas.innerHTML = '';
        new QRCode(qrCodeCanvas, {
            text: JSON.stringify({ shopId: SHOP_ID, amount: amount, transactionId: currentTransactionId }),
            width: 200, height: 200
        });
        qrUrlText.textContent = `ID: ${currentTransactionId}`;
        paymentStatusText.textContent = '顧客からの支払い待ち...';

        listener = database.ref('payment_status/' + currentTransactionId).on('value', snap => {
            const val = snap.val();
            if (val && val.status === 'completed') {
                database.ref('payment_status/' + currentTransactionId).off('value', listener);
                
                const li = document.createElement('li');
                li.innerHTML = `入金: ${amount}円 (${val.userId})`;
                shopTransactionHistoryEl.insertBefore(li, shopTransactionHistoryEl.firstChild); 

                receivedAmountEl.textContent = `¥ ${amount}`;
                receivedCustomerInfoEl.textContent = val.userId;
                
                showSection(paymentReceivedSection);

                // ★自動で閉じない設定（連続支払いは、手動で戻るボタンを押して行う）
            }
        });
    });

    // --- 送金カメラ ---
    function startCamera() {
        showSection(shopScannerSection);
        shopCameraVideo.setAttribute("playsinline", true);
        shopCameraVideo.setAttribute("muted", true);

        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
            shopVideoObj = stream;
            shopCameraVideo.srcObject = stream;
            shopCameraVideo.play();
            requestAnimationFrame(tick);
        });
    }

    function tick() {
        if (shopCameraVideo.readyState === 4) {
            shopQrCanvas.width = shopCameraVideo.videoWidth;
            shopQrCanvas.height = shopCameraVideo.videoHeight;
            const ctx = shopQrCanvas.getContext('2d');
            ctx.drawImage(shopCameraVideo, 0, 0);
            const imageData = ctx.getImageData(0,0,shopQrCanvas.width,shopQrCanvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
            if (code) {
                try {
                    const data = JSON.parse(code.data);
                    if (data.type === 'receive_money' && data.userId) {
                        targetUserId = data.userId;
                        stopCamera();
                        targetUserIdDisplay.textContent = targetUserId;
                        remittanceAmountInput.value = '';
                        showSection(remittanceAmountSection);
                        return;
                    }
                } catch(e){}
            }
        }
        if (shopVideoObj) requestAnimationFrame(tick);
    }

    function stopCamera() {
        if(shopVideoObj) shopVideoObj.getTracks().forEach(t=>t.stop());
        shopVideoObj = null;
    }

    startRemittanceBtn.addEventListener('click', startCamera);
    cancelRemittanceBtn.addEventListener('click', () => { stopCamera(); showSection(mainShopSection); });
    backToScanBtn.addEventListener('click', startCamera);

    confirmRemittanceBtn.addEventListener('click', async () => {
        const amount = parseInt(remittanceAmountInput.value);
        if (!amount || amount <= 0) return alert('金額を入力');
        if (!confirm(`${amount}円を送金しますか？`)) return;

        await database.ref('remittances/' + targetUserId).push({
            amount: amount, shopId: SHOP_ID, timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        alert('送金完了');
        showSection(mainShopSection);
    });

    resetAppBtn.addEventListener('click', () => {
        if(currentTransactionId && listener) database.ref('payment_status/' + currentTransactionId).off('value', listener);
        showSection(mainShopSection);
        paymentAmountInput.value = '0';
    });
    
    // 手動で戻るボタン
    backToMainFromShopCompletionBtn.addEventListener('click', () => {
        showSection(mainShopSection);
        paymentAmountInput.value = '0'; // 次の支払いのためにリセット
    });
});
