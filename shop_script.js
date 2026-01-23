document.addEventListener('DOMContentLoaded', () => {
    const els = {
        main: document.getElementById('mainShopSection'),
        amtInput: document.getElementById('paymentAmount'),
        qrSection: document.getElementById('qrDisplaySection'),
        qrCanvas: document.getElementById('qrCodeCanvas'),
        receivedSection: document.getElementById('paymentReceivedSection'),
        history: document.getElementById('shopTransactionHistory')
    };

    const SHOP_ID = 'YanaharaSHOP001';
    let currentId = null;
    let listener = null;

    function show(target) {
        [els.main, els.qrSection, els.receivedSection].forEach(s => s.classList.add('hidden'));
        target.classList.remove('hidden');
    }

    function generate(amt) {
        currentId = 'txn_' + Date.now();
        database.ref('payment_requests/' + currentId).set({
            shopId: SHOP_ID, amount: amt, status: 'pending', timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        els.qrCanvas.innerHTML = '';
        new QRCode(els.qrCanvas, {
            text: JSON.stringify({ shopId: SHOP_ID, amount: amt, transactionId: currentId }),
            width: 200, height: 200
        });

        listener = database.ref('payment_status/' + currentId).on('value', snap => {
            const val = snap.val();
            if (val && val.status === 'completed') {
                database.ref('payment_status/' + currentId).off('value', listener);
                
                // 履歴更新
                const li = document.createElement('li');
                li.innerHTML = `入金: ¥ ${parseInt(amt).toLocaleString()}`;
                els.history.insertBefore(li, els.history.firstChild);

                document.getElementById('receivedAmount').textContent = `¥ ${parseInt(amt).toLocaleString()}`;
                show(els.receivedSection);

                // ★2秒後に自動でQR再生成 (連続決済)
                setTimeout(() => {
                    if (els.main.classList.contains('hidden')) {
                        generate(amt);
                        show(els.qrSection);
                    }
                }, 2000);
            }
        });
    }

    document.getElementById('generateQrBtn').onclick = () => {
        const amt = els.amtInput.value;
        if (amt > 0) {
            show(els.qrSection);
            generate(amt);
        }
    };

    document.getElementById('resetAppBtn').onclick = () => {
        if (listener) database.ref('payment_status/' + currentId).off('value', listener);
        show(els.main);
    };
    
    document.getElementById('backToMainFromShopCompletionBtn').onclick = () => show(els.main);
});
