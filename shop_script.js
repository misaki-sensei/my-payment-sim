// --- 支払い受付処理 ---
function startPayment(amount) {
    if (autoTimer) clearTimeout(autoTimer);
    
    // 1. 新しい決済IDを発行（毎回新しくすることで重複を防ぐ）
    currentExpectedTransactionId = 'txn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    
    const qrData = JSON.stringify({ 
        shopId: SHOP_ID, 
        amount: amount, 
        transactionId: currentExpectedTransactionId 
    });

    showSection(qrDisplaySection);
    qrCodeCanvas.innerHTML = '';
    // QRコード生成
    new QRCode(qrCodeCanvas, { text: qrData, width: 200, height: 200 });
    
    // 2. 監視のセットアップ
    // 重要：一旦古い監視をクリアしてから、この決済ID専用の監視を開始する
    database.ref('paymentStatuses').off(); 

    database.ref('paymentStatuses').on('child_added', (snapshot) => {
        const data = snapshot.val();
        
        // 今回発行した transactionId と一致するかチェック
        if (data && data.transactionId === currentExpectedTransactionId) {
            // 一致したら監視を止めて、完了画面へ
            database.ref('paymentStatuses').off();
            handlePaymentCompleted(data.customerId || 'Unknown', amount);
        }
    });
}

// --- 支払い完了後の処理 ---
function handlePaymentCompleted(userId, amount) {
    saveAndRender('income', amount, userId);
    receivedAmountEl.textContent = `¥ ${parseInt(amount).toLocaleString()}`;
    receivedCustomerInfoEl.textContent = `User: ${userId}`;
    showSection(paymentReceivedSection);

    // 【重要】2秒後に自動的に「同じ金額のQRコード生成」へ戻る
    // これにより店員が操作しなくても次の客の支払いを待機できます
    autoTimer = setTimeout(() => { 
        // メイン画面に戻るのではなく、同じ金額で startPayment を呼び出す
        startPayment(amount); 
    }, AUTO_DELAY);
}

// --- メイン画面の「QR作成」ボタン ---
generateQrBtn.onclick = () => {
    const amount = paymentAmountInput.value;
    if (amount && amount > 0) {
        startPayment(amount);
    } else {
        alert("金額を正しく入力してください");
    }
};

// --- 「完了画面」の閉じるボタン ---
backToMainFromShopCompletionBtn.onclick = () => {
    if (autoTimer) clearTimeout(autoTimer);
    database.ref('paymentStatuses').off(); // 監視を完全に終了
    showSection(mainShopSection);
};
