document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素 ---
    const mainShopSection = document.getElementById('mainShopSection');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const generateQrBtn = document.getElementById('generateQrBtn');
    const qrDisplaySection = document.getElementById('qrDisplaySection');
    const qrCodeCanvas = document.getElementById('qrCodeCanvas');
    const resetAppBtn = document.getElementById('resetAppBtn');

    const paymentReceivedSection = document.getElementById('paymentReceivedSection');
    const receivedAmountEl = document.getElementById('receivedAmount');
    const payerIdEl = document.getElementById('payerId'); // お客ID表示用（HTMLに追加が必要）
    const shopTransactionHistoryEl = document.getElementById('shopTransactionHistory');
    const backToMainFromShopCompletionBtn = document.getElementById('backToMainFromShopCompletionBtn');

    // --- 定数 ---
    const SHOP_ID = 'YanaharaSHOP001';
    const AUTO_REGENERATE_DELAY = 2000; // 2秒

    // 変数
    let currentTransactionId = null;
    let listener = null;

    // --- セクション切り替え ---
    const showSection = (target) => {
        [mainShopSection, qrDisplaySection, paymentReceivedSection].forEach(s => {
            if (s) s.classList.add('hidden');
        });
        if (target) target.classList.remove('hidden');
    };

    // --- QRコード生成と支払い監視 ---
    const startPayment = (amount) => {
        // 1. トランザクションIDの発行
        currentTransactionId = 'txn_' + Date.now();

        // 2. Firebaseに支払いリクエストを作成
        database.ref('payment_requests/' + currentTransactionId).set({
            shopId: SHOP_ID,
            amount: amount,
            status: 'pending',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        // 3. QRコード表示
        qrCodeCanvas.innerHTML = '';
        new QRCode(qrCodeCanvas, {
            text: JSON.stringify({
                shopId: SHOP_ID,
                amount: amount,
                transactionId: currentTransactionId
            }),
            width: 200,
            height: 200
        });

        showSection(qrDisplaySection);

        // 4. 支払い完了の監視
        if (listener) database.ref('payment_status/' + currentTransactionId).off(); // 以前のリスナー解除

        listener = database.ref('payment_status/' + currentTransactionId).on('value', snapshot => {
            const data = snapshot.val();
            if (data && data.status === 'completed') {
                // 監視を止める
                database.ref('payment_status/' + currentTransactionId).off();

                // 履歴に追加
                const li = document.createElement('li');
                const dateStr = new Date().toLocaleTimeString();
                li.innerHTML = `<span>${dateStr}</span> <span>¥ ${parseInt(amount).toLocaleString()}</span> <small>(${data.userId})</small>`;
                shopTransactionHistoryEl.insertBefore(li, shopTransactionHistoryEl.firstChild);

                // 完了画面の表示
                receivedAmountEl.textContent = `¥ ${parseInt(amount).toLocaleString()}`;
                if (payerIdEl) payerIdEl.textContent = `お客ID: ${data.userId}`;
                showSection(paymentReceivedSection);

                // ★【追加】2秒後に自動で同じ金額のQRコードを再表示（連続決済）
                setTimeout(() => {
                    // もし店員が手動でメイン画面に戻っていなければ、再度QR生成
                    if (!mainShopSection.classList.contains('hidden')) {
                        startPayment(amount);
                    }
                }, AUTO_REGENERATE_DELAY);
            }
        });
    };

    // --- イベントリスナー ---
    generateQrBtn.addEventListener('click', () => {
        const amount = paymentAmountInput.value;
        if (!amount || amount <= 0) return alert('金額を入力してください');
        startPayment(amount);
    });

    resetAppBtn.addEventListener('click', () => {
        if (currentTransactionId) database.ref('payment_status/' + currentTransactionId).off();
        showSection(mainShopSection);
    });

    backToMainFromShopCompletionBtn.addEventListener('click', () => {
        if (currentTransactionId) database.ref('payment_status/' + currentTransactionId).off();
        showSection(mainShopSection);
    });
});
