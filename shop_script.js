document.addEventListener('DOMContentLoaded', () => {
    // URLパラメータからtransactionIdを取得し、支払い完了メッセージを表示
    const transactionId = new URLSearchParams(window.location.search).get('transactionId');
    if (transactionId) {
        document.getElementById('transaction-id-display').textContent = transactionId;
        document.getElementById('payment-complete-message').style.display = 'block';
        document.getElementById('qr-generate-section').classList.add('hidden'); // QR生成セクションを非表示に
        document.getElementById('qr-display-section').classList.remove('hidden'); // QR表示セクションを表示
        // この時点でQRコードは表示済みなので、待機状態ではなく完了状態にする
        document.getElementById('payment-status-section').innerHTML = `
            <p id="payment-complete-message" class="status-success"><span class="icon">✅</span> 支払い完了！</p>
            <p id="transaction-id-display" class="small-text">${transactionId}</p>
        `;
    }

    // 店舗IDの表示 (固定値または動的に生成)
    const shopId = "SHOP001"; // 例として固定の店舗IDを設定
    document.getElementById('shop-id-display').textContent = shopId;

    const generateQrButton = document.getElementById('generate-qr-button');
    const amountInput = document.getElementById('amount');
    const qrCodeCanvas = document.getElementById('qr-code-canvas');
    const qrAmountDisplay = document.getElementById('qr-amount-display');
    const qrUrlText = document.getElementById('qrUrlText');
    const qrGenerateSection = document.getElementById('qr-generate-section');
    const qrDisplaySection = document.getElementById('qr-display-section');
    const backToMainButton = document.getElementById('back-to-main-button');
    const paymentStatusSection = document.getElementById('payment-status-section');

    generateQrButton.addEventListener('click', () => {
        const amount = parseInt(amountInput.value);
        if (amount > 0) {
            // QRコードに含めるデータを生成 (顧客アプリのURL + 金額 + 店舗ID)
            const customerAppUrl = window.location.origin + '/customer.html';
            const qrData = `${customerAppUrl}?amount=${amount}&shopId=${shopId}`;

            // QRコードを生成
            qrCodeCanvas.innerHTML = ''; // Canvasをクリア
            new QRCode(qrCodeCanvas, {
                text: qrData,
                width: 200,
                height: 200,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });

            qrAmountDisplay.textContent = amount.toLocaleString();
            qrUrlText.textContent = qrData; // デバッグ用にURLを表示
            
            qrGenerateSection.classList.add('hidden');
            qrDisplaySection.classList.remove('hidden');
            
            // 支払いステータスを「待機中」にリセット
            paymentStatusSection.innerHTML = `
                <p class="status-pending"><span class="icon">⏳</span> 支払い待機中...</p>
                <p id="payment-complete-message" class="status-success hidden"><span class="icon">✅</span> 支払い完了！</p>
                <p id="transaction-id-display" class="small-text"></p>
            `;
        } else {
            alert('有効な金額を入力してください。');
        }
    });

    backToMainButton.addEventListener('click', () => {
        qrDisplaySection.classList.add('hidden');
        qrGenerateSection.classList.remove('hidden');
        document.getElementById('payment-complete-message').classList.add('hidden'); // 完了メッセージを非表示に
    });

    const clearHistoryButton = document.getElementById('clear-shop-history');
    if (clearHistoryButton) {
        clearHistoryButton.addEventListener('click', () => {
            if (confirm('店舗の履歴をすべて削除してもよろしいですか？')) {
                localStorage.removeItem('shopHistory');
                updateShopHistoryDisplay();
            }
        });
    }

    updateShopHistoryDisplay();
});

function recordShopTransaction(amount, customerId) {
    let shopHistory = JSON.parse(localStorage.getItem('shopHistory')) || [];
    const transactionId = 'TRN' + Date.now() + Math.floor(Math.random() * 1000); // 一意の取引ID
    shopHistory.push({
        id: transactionId,
        amount: amount,
        timestamp: new Date().toISOString(),
        customerId: customerId // どの顧客からの支払いか
    });
    localStorage.setItem('shopHistory', JSON.stringify(shopHistory));
    return transactionId;
}

function updateShopHistoryDisplay() {
    const historyList = document.getElementById('shop-history-list');
    if (!historyList) return;

    historyList.innerHTML = ''; // リストをクリア
    let shopHistory = JSON.parse(localStorage.getItem('shopHistory')) || [];

    // 最新の履歴が上に来るように逆順にする
    shopHistory.slice().reverse().forEach(transaction => {
        const listItem = document.createElement('li');
        const date = new Date(transaction.timestamp);
        const dateStr = date.toLocaleDateString(); // 例: 2023/01/23
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); // 例: 14:35
        const shortTransactionId = transaction.id.substring(0, 8); // 取引IDを短縮

        // 修正点：入金完了と金額を1行に表示
        listItem.innerHTML = `
            <span>入金完了 ¥ ${transaction.amount.toLocaleString()}</span>
            <span class="history-date">${dateStr} ${timeStr} (${transaction.customerId || '不明な顧客'}) [${shortTransactionId}]</span>
        `;
        historyList.appendChild(listItem);
    });
}
