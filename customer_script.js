document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素 ---
    const mainUserSection = document.getElementById('mainUserSection');
    const userBalanceEl = document.getElementById('userBalance');
    const userScannerSection = document.getElementById('userScannerSection');
    const userCameraVideo = document.getElementById('userCameraVideo');
    const userQrCanvas = document.getElementById('userQrCanvas');
    const paymentConfirmSection = document.getElementById('paymentConfirmSection');
    const confirmAmountEl = document.getElementById('confirmAmount');
    const confirmShopIdEl = document.getElementById('confirmShopId');
    const execPaymentBtn = document.getElementById('execPaymentBtn');
    const cancelPaymentBtn = document.getElementById('cancelPaymentBtn');

    // 完了画面関連
    const userCompletionSection = document.getElementById('userCompletionSection');
    const completedAmountEl = document.getElementById('completedAmount');
    const backToMainFromUserBtn = document.getElementById('backToMainFromUserBtn');

    // 履歴
    const userTransactionHistoryEl = document.getElementById('userTransactionHistory');

    // --- 設定・変数 ---
    const myUserId = 'USER_999'; // 本来はログイン等で取得
    const AUTO_DELAY = 2000;      // 2秒で戻る
    const STORAGE_KEY = 'user_history_data';

    let userVideoObj = null;
    let currentPaymentData = null;
    let transactions = [];

    // --- 履歴管理 (LocalStorage) ---
    function loadHistory() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            transactions = JSON.parse(saved);
            transactions.forEach(t => renderHistoryItem(t));
        }
    }

    function saveAndRender(type, amount, shopId) {
        const timeStr = new Date().toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'});
        const newTx = { type, amount, shopId, time: timeStr };
        transactions.push(newTx);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
        renderHistoryItem(newTx);
    }

    function renderHistoryItem(t) {
        const li = document.createElement('li');
        li.style.padding = "10px"; li.style.borderBottom = "1px solid #eee"; li.style.listStyle = "none";
        const color = t.type === 'pay' ? '#007bff' : '#ff9800';
        const label = t.type === 'pay' ? '💸 支払い' : '💰 受取';
        li.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <strong style="color:${color}">${label}: ¥${parseInt(t.amount).toLocaleString()}</strong>
                <span style="font-size:0.8em; color:#888;">${t.time}</span>
            </div>
            <div style="font-size:0.8em; color:#666;">店舗: ${t.shopId}</div>
        `;
        userTransactionHistoryEl.insertBefore(li, userTransactionHistoryEl.firstChild);
    }

    // --- 画面切り替え ---
    function showSection(section) {
        [mainUserSection, userScannerSection, paymentConfirmSection, userCompletionSection].forEach(sec => {
            if(sec) sec.classList.add('hidden');
        });
        if(section) section.classList.remove('hidden');
    }

    // --- カメラ・スキャン処理 ---
    window.startUserScanner = function() {
        showSection(userScannerSection);
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
            userVideoObj = stream; userCameraVideo.srcObject = stream; userCameraVideo.play();
            requestAnimationFrame(tickUserQr);
        });
    };

    function tickUserQr() {
        if (userCameraVideo.readyState === userCameraVideo.HAVE_ENOUGH_DATA) {
            userQrCanvas.height = userCameraVideo.videoHeight;
            userQrCanvas.width = userCameraVideo.videoWidth;
            const ctx = userQrCanvas.getContext("2d");
            ctx.drawImage(userCameraVideo, 0, 0, userQrCanvas.width, userQrCanvas.height);
            const code = jsQR(ctx.getImageData(0, 0, userQrCanvas.width, userQrCanvas.height).data, userQrCanvas.width, userQrCanvas.height);
            if (code) {
                try {
                    const data = JSON.parse(code.data);
                    if (data.shopId && data.amount) {
                        stopCamera();
                        currentPaymentData = data;
                        confirmAmountEl.textContent = `¥ ${parseInt(data.amount).toLocaleString()}`;
                        confirmShopIdEl.textContent = `店舗: ${data.shopId}`;
                        showSection(paymentConfirmSection);
                        return;
                    }
                } catch (e) {}
            }
        }
        if (userVideoObj) requestAnimationFrame(tickUserQr);
    }

    function stopCamera() {
        if (userVideoObj) { userVideoObj.getTracks().forEach(t => t.stop()); userVideoObj = null; }
    }

    // --- 支払い実行 (GAS連携・お店通知) ---
    execPaymentBtn.onclick = async () => {
        try {
            const amount = parseInt(currentPaymentData.amount);
            const shopId = currentPaymentData.shopId;
            const txnId = currentPaymentData.transactionId;
            const now = new Date().toISOString();

            // 1. GAS連携用パス (paymentStatuses) への書き込み
            await database.ref('paymentStatuses').push({
                amount: amount,
                shopId: shopId,
                customerId: myUserId, // GAS側が探すキー名
                timestamp: now,
                transactionId: txnId
            });

            // 2. お店側アプリへの通知 (payment_status)
            await database.ref('payment_status/' + txnId).set({
                status: 'completed',
                userId: myUserId,
                timestamp: now
            });

            // 履歴保存と画面遷移
            saveAndRender('pay', amount, shopId);
            completedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
            showSection(userCompletionSection);

            // 2秒後に自動で戻る
            setTimeout(() => { showSection(mainUserSection); }, AUTO_DELAY);

        } catch (e) {
            alert("支払いエラー: " + e.message);
        }
    };

    // --- 送金（受取）のリアルタイム監視 ---
    database.ref('remittances/' + myUserId).on('child_added', (snapshot) => {
        const data = snapshot.val();
        if (data && !data.processed) {
            // 受取履歴を保存（お店側から送金されたとき）
            saveAndRender('receive', data.amount, data.shopId);
            // 処理済みフラグ（リロード後の重複表示防止）
            database.ref('remittances/' + myUserId + '/' + snapshot.key).update({ processed: true });
            alert(`店舗 ${data.shopId} から ¥${data.amount} の送金を受け取りました！`);
        }
    });

    cancelPaymentBtn.onclick = () => { stopCamera(); showSection(mainUserSection); };
    backToMainFromUserBtn.onclick = () => showSection(mainUserSection);

    loadHistory();
});
