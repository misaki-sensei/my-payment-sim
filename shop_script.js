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

    let currentExpectedTransactionId = null;
    let paymentStatusListener = null;
    let shopVideoObj = null;
    let targetUserId = null;
    let autoTimer = null;

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

    // --- 履歴表示の改善 ---
    function addHistoryToList(type, amount, userId) {
        const li = document.createElement('li');
        li.style.padding = "10px";
        li.style.borderBottom = "1px solid #eee";
        li.style.listStyle = "none";
        li.style.display = "flex";
        li.style.flexDirection = "column";

        const timeStr = new Date().toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'});
        const color = type === 'income' ? '#28a745' : '#dc3545';
        const label = type === 'income' ? '💰 入金' : '💸 送金';

        li.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="color: ${color}; font-size: 1.1em;">${label}: ¥${parseInt(amount).toLocaleString()}</strong>
                <span style="font-size: 0.8em; color: #888;">${timeStr}</span>
            </div>
            <div style="font-size: 0.85em; color: #555; margin-top: 4px; word-break: break-all;">
                ID: ${userId}
            </div>
        `;
        shopTransactionHistoryEl.insertBefore(li, shopTransactionHistoryEl.firstChild);
    }

    // --- 支払い処理 ---
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
        addHistoryToList('income', amount, userId);

        receivedAmountEl.textContent = `¥ ${parseInt(amount).toLocaleString()}`;
        receivedCustomerInfoEl.textContent = `User: ${userId}`;
        showSection(paymentReceivedSection);

        autoTimer = setTimeout(() => {
            if (!paymentReceivedSection.classList.contains('hidden')) startPayment(amount);
        }, AUTO_DELAY);
    }

    // --- 送金処理 ---
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

    confirmRemittanceBtn.addEventListener('click', async () => {
        const amount = parseInt(remittanceAmountInput.value);
        if (!amount || amount <= 0) return alert('金額を入力してください');
        if (!confirm(`${amount}円を送金しますか？`)) return;

        try {
            await database.ref('remittances/' + targetUserId).push({
                amount: amount, shopId: SHOP_ID, timestamp: firebase.database.ServerValue.TIMESTAMP
            });

            addHistoryToList('outgo', amount, targetUserId);
            sentAmountDisplay.textContent = `¥ ${amount.toLocaleString()}`;
            sentToUserDisplay.textContent = `宛先ID: ${targetUserId}`;
            showSection(remittanceCompSection);

            autoTimer = setTimeout(() => {
                if (!remittanceCompSection.classList.contains('hidden')) showSection(mainShopSection);
            }, AUTO_DELAY);
        } catch (e) { alert('送金失敗: ' + e.message); }
    });

    resetAppBtn.addEventListener('click', () => showSection(mainShopSection));
    backToMainFromShopCompletionBtn.addEventListener('click', () => showSection(mainShopSection));
    if (backToMainFromRemittanceBtn) backToMainFromRemittanceBtn.addEventListener('click', () => showSection(mainShopSection));
});
