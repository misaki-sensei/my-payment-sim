document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素 ---
    const mainShopSection = document.getElementById('mainShopSection');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const generateQrBtn = document.getElementById('generateQrBtn');
    const qrDisplaySection = document.getElementById('qrDisplaySection');
    const qrCodeCanvas = document.getElementById('qrCodeCanvas');
    const paymentReceivedSection = document.getElementById('paymentReceivedSection');
    const receivedAmountEl = document.getElementById('receivedAmount');
    const receivedCustomerInfoEl = document.getElementById('receivedCustomerInfo');
    const backToMainFromShopCompletionBtn = document.getElementById('backToMainFromShopCompletionBtn');
    const shopTransactionHistoryEl = document.getElementById('shopTransactionHistory');
    const shopScannerSection = document.getElementById('shopScannerSection');
    const shopCameraVideo = document.getElementById('shopCameraVideo');
    const shopQrCanvas = document.getElementById('shopQrCanvas');
    const remittanceAmountSection = document.getElementById('remittanceAmountSection');
    const targetUserIdDisplay = document.getElementById('targetUserIdDisplay');
    const remittanceAmountInput = document.getElementById('remittanceAmountInput');
    const confirmRemittanceBtn = document.getElementById('confirmRemittanceBtn');

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
        li.style.padding = "10px"; li.style.borderBottom = "1px solid #eee"; li.style.listStyle = "none";
        const color = t.type === 'income' ? '#28a745' : '#dc3545';
        li.innerHTML = `<strong style="color:${color}">${t.type==='income'?'💰入金':'💸送金'}: ¥${parseInt(t.amount).toLocaleString()}</strong> <small>${t.time}</small><br><small>ID: ${t.userId}</small>`;
        shopTransactionHistoryEl.insertBefore(li, shopTransactionHistoryEl.firstChild);
    }

    function showSection(section) {
        if (autoTimer) clearTimeout(autoTimer);
        [mainShopSection, qrDisplaySection, shopScannerSection, remittanceAmountSection, paymentReceivedSection].forEach(sec => { if(sec) sec.classList.add('hidden'); });
        if (section) section.classList.remove('hidden');
    }

    // --- 支払い受付（重要：ID照合） ---
    function startPayment(amount) {
        if (autoTimer) clearTimeout(autoTimer);
        
        // ユニークIDを発行
        currentExpectedTransactionId = 'txn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        
        const qrData = JSON.stringify({ 
            shopId: SHOP_ID, 
            amount: amount, 
            transactionId: currentExpectedTransactionId 
        });

        showSection(qrDisplaySection);
        qrCodeCanvas.innerHTML = '';
        new QRCode(qrCodeCanvas, { text: qrData, width: 200, height: 200 });
        
        // 以前の監視をリセット
        database.ref('paymentStatuses').off();

        // 監視開始
        database.ref('paymentStatuses').on('child_added', (snapshot) => {
            const data = snapshot.val();
            // IDが一致するか厳格にチェック
            if (data && data.transactionId === currentExpectedTransactionId) {
                database.ref('paymentStatuses').off(); // 即座に解除
                handlePaymentCompleted(data.customerId || 'Unknown', amount);
            }
        });
    }

    function handlePaymentCompleted(userId, amount) {
        saveAndRender('income', amount, userId);
        receivedAmountEl.textContent = `¥ ${parseInt(amount).toLocaleString()}`;
        receivedCustomerInfoEl.textContent = `User: ${userId}`;
        showSection(paymentReceivedSection);
        autoTimer = setTimeout(() => { showSection(mainShopSection); }, AUTO_DELAY);
    }

    // --- 送金処理 ---
    confirmRemittanceBtn.onclick = async () => {
        const amount = parseInt(remittanceAmountInput.value);
        if (!amount || amount <= 0) return alert('金額を入力');
        try {
            const now = new Date().toISOString();
            // GAS用（マイナス表記）
            await database.ref('paymentStatuses').push({
                amount: -amount, shopId: SHOP_ID, customerId: targetUserId, timestamp: now, transactionId: 'remit_' + Date.now()
            });
            // ユーザー受取用
            await database.ref('remittances/' + targetUserId).push({ amount: amount, shopId: SHOP_ID, timestamp: now });
            saveAndRender('outgo', amount, targetUserId);
            alert("送金完了");
            showSection(mainShopSection);
        } catch (e) { alert(e.message); }
    };

    generateQrBtn.onclick = () => {
        const amount = paymentAmountInput.value;
        if (amount > 0) startPayment(amount);
    };

    backToMainFromShopCompletionBtn.onclick = () => showSection(mainShopSection);
    loadHistory();
});
