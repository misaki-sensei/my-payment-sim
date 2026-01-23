document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素 ---
    // (中略：既存の宣言と同じ)
    const mainShopSection = document.getElementById('mainShopSection');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const generateQrBtn = document.getElementById('generateQrBtn');
    const qrDisplaySection = document.getElementById('qrDisplaySection');
    const qrCodeCanvas = document.getElementById('qrCodeCanvas');
    const paymentStatusText = document.getElementById('paymentStatusMessage');
    const resetAppBtn = document.getElementById('resetAppBtn');
    const shopScannerSection = document.getElementById('shopScannerSection');
    const shopCameraVideo = document.getElementById('shopCameraVideo');
    const shopQrCanvas = document.getElementById('shopQrCanvas');
    const remittanceAmountSection = document.getElementById('remittanceAmountSection');
    const targetUserIdDisplay = document.getElementById('targetUserIdDisplay');
    const remittanceAmountInput = document.getElementById('remittanceAmountInput');
    const confirmRemittanceBtn = document.getElementById('confirmRemittanceBtn');
    const paymentReceivedSection = document.getElementById('paymentReceivedSection');
    const receivedAmountEl = document.getElementById('receivedAmount');
    const receivedCustomerInfoEl = document.getElementById('receivedCustomerInfo');
    const remittanceCompSection = document.getElementById('remittanceCompletionSection');
    const sentAmountDisplay = document.getElementById('sentAmountDisplay');
    const sentToUserDisplay = document.getElementById('sentToUserDisplay');
    const shopTransactionHistoryEl = document.getElementById('shopTransactionHistory');

    // --- 定数・変数 ---
    const SHOP_ID = 'YanaharaSHOP001';
    const AUTO_DELAY = 2000;
    const STORAGE_KEY = 'shop_transaction_history'; // 保存用のキー

    let currentExpectedTransactionId = null;
    let paymentStatusListener = null;
    let shopVideoObj = null;
    let targetUserId = null;
    let autoTimer = null;
    let transactions = []; // 履歴データ保持用

    // --- 履歴の初期読み込み ---
    function loadHistory() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            transactions = JSON.parse(saved);
            transactions.forEach(t => renderHistoryItem(t));
        }
    }

    // --- 履歴を画面に描画する ---
    function renderHistoryItem(t) {
        const li = document.createElement('li');
        li.style.padding = "10px";
        li.style.borderBottom = "1px solid #eee";
        li.style.listStyle = "none";
        li.style.display = "flex";
        li.style.flexDirection = "column";

        const color = t.type === 'income' ? '#28a745' : '#dc3545';
        const label = t.type === 'income' ? '💰 入金' : '💸 送金';

        li.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="color: ${color}; font-size: 1.1em;">${label}: ¥${t.amount.toLocaleString()}</strong>
                <span style="font-size: 0.8em; color: #888;">${t.time}</span>
            </div>
            <div style="font-size: 0.85em; color: #555; margin-top: 4px; word-break: break-all;">
                ID: ${t.userId}
            </div>
        `;
        shopTransactionHistoryEl.insertBefore(li, shopTransactionHistoryEl.firstChild);
    }

    // --- 履歴を保存する ---
    function saveTransaction(type, amount, userId) {
        const timeStr = new Date().toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'});
        const newTransaction = { type, amount: parseInt(amount), userId, time: timeStr };
        
        transactions.push(newTransaction);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
        renderHistoryItem(newTransaction);
    }

    // --- (以下、画面切り替えや支払い処理など) ---

    function showSection(section) {
        if (autoTimer) clearTimeout(autoTimer);
        const allSections = [
            mainShopSection, qrDisplaySection, shopScannerSection, 
            remittanceAmountSection, paymentReceivedSection, remittanceCompSection
        ];
        allSections.forEach(sec => { if (sec) sec.classList.add('hidden'); });
        if (section) section.classList.remove('hidden');
    }

    function startPayment(amount) {
        currentExpectedTransactionId = 'txn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const qrData = JSON.stringify({ shopId: SHOP_ID, amount: amount, transactionId: currentExpectedTransactionId });

        database.ref('payment_requests/' + currentExpectedTransactionId).set({
            shopId: SHOP_ID, amount: amount, status: 'pending', timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        showSection(qrDisplaySection);
        qrCodeCanvas.innerHTML = '';
        new QRCode(qrCodeCanvas, { text: qrData, width: 200, height: 200 });
        
        if (paymentStatusListener) database.ref('payment_status/' + currentExpectedTransactionId).off();
        paymentStatusListener = database.ref('payment_status/' + currentExpectedTransactionId).on('value', (snapshot) => {
            const statusData = snapshot.val();
            if (statusData && statusData.status === 'completed') {
                database.ref('payment_status/' + currentExpectedTransactionId).off();
                
                // 保存と描画
                saveTransaction('income', amount, statusData.userId);

                receivedAmountEl.textContent = `¥ ${parseInt(amount).toLocaleString()}`;
                receivedCustomerInfoEl.textContent = `User: ${statusData.userId}`;
                showSection(paymentReceivedSection);

                autoTimer = setTimeout(() => {
                    if (!paymentReceivedSection.classList.contains('hidden')) startPayment(amount);
                }, AUTO_DELAY);
            }
        });
    }

    // --- 送金実行 ---
    confirmRemittanceBtn.addEventListener('click', async () => {
        const amount = parseInt(remittanceAmountInput.value);
        if (!amount || amount <= 0) return alert('金額を入力してください');
        if (!confirm(`${amount}円を送金しますか？`)) return;

        try {
            await database.ref('remittances/' + targetUserId).push({
                amount: amount, shopId: SHOP_ID, timestamp: firebase.database.ServerValue.TIMESTAMP
            });

            // 保存と描画
            saveTransaction('outgo', amount, targetUserId);

            sentAmountDisplay.textContent = `¥ ${amount.toLocaleString()}`;
            sentToUserDisplay.textContent = `宛先ID: ${targetUserId}`;
            showSection(remittanceCompSection);

            autoTimer = setTimeout(() => {
                if (!remittanceCompSection.classList.contains('hidden')) showSection(mainShopSection);
            }, AUTO_DELAY);
        } catch (e) { alert('送金失敗: ' + e.message); }
    });

    // 初期起動時に履歴を読み込む
    loadHistory();

    // (その他、カメラ処理やボタンイベントは前回のコードを維持)
    generateQrBtn.addEventListener('click', () => {
        const amount = paymentAmountInput.value;
        if (!amount || amount <= 0) return alert("金額を入力してください");
        startPayment(amount);
    });

    startRemittanceBtn.addEventListener('click', startShopQrReader);
    // ...以下略 (前回コード参照)
});
