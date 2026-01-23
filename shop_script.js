document.addEventListener('DOMContentLoaded', () => {
    const mainShopSection = document.getElementById('mainShopSection');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const generateQrBtn = document.getElementById('generateQrBtn');
    const qrDisplaySection = document.getElementById('qrDisplaySection');
    const qrCodeCanvas = document.getElementById('qrCodeCanvas');
    const paymentReceivedSection = document.getElementById('paymentReceivedSection');
    const shopTransactionHistoryEl = document.getElementById('shopTransactionHistory');

    const SHOP_ID = 'YanaharaSHOP001';
    let currentTransactionId = null;
    let listener = null;

    function showSection(target) {
        [mainShopSection, qrDisplaySection, paymentReceivedSection].forEach(s => s.classList.add('hidden'));
        target.classList.remove('hidden');
    }

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

        listener = database.ref('payment_status/' + currentTransactionId).on('value', snap => {
            const val = snap.val();
            if (val && val.status === 'completed') {
                database.ref('payment_status/' + currentTransactionId).off('value', listener);
                
                const li = document.createElement('li');
                li.innerHTML = `<span>入金: ¥ ${parseInt(amount).toLocaleString()}</span>`;
                shopTransactionHistoryEl.insertBefore(li, shopTransactionHistoryEl.firstChild); 

                document.getElementById('receivedAmount').textContent = `¥ ${parseInt(amount).toLocaleString()}`;
                document.getElementById('receivedCustomerInfo').textContent = `顧客ID: ${val.userId}`;
                showSection(paymentReceivedSection);
            }
        });
    });

    document.getElementById('resetAppBtn').addEventListener('click', () => {
        if(listener) database.ref('payment_status/' + currentTransactionId).off('value', listener);
        showSection(mainShopSection);
    });

    document.getElementById('backToMainFromShopCompletionBtn').addEventListener('click', () => {
        showSection(mainShopSection);
        paymentAmountInput.value = '0';
    });
});
