document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素 ---
    const mainShopSection = document.getElementById('mainShopSection');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const generateQrBtn = document.getElementById('generateQrBtn');
    
    // 支払いQR表示関連
    const qrDisplaySection = document.getElementById('qrDisplaySection');
    const qrCodeCanvas = document.getElementById('qrCodeCanvas');
    const qrUrlText = document.getElementById('qrUrlText');
    const paymentStatusText = document.getElementById('paymentStatusMessage');
    const resetAppBtn = document.getElementById('resetAppBtn');

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

    // 完了・履歴関連
    const paymentReceivedSection = document.getElementById('paymentReceivedSection');
    const receivedAmountEl = document.getElementById('receivedAmount');
    const receivedCustomerInfoEl = document.getElementById('receivedCustomerInfo');
    const backToMainFromShopCompletionBtn = document.getElementById('backToMainFromShopCompletionBtn');
    const shopTransactionHistoryEl = document.getElementById('shopTransactionHistory');

    // --- 定数・変数 ---
    const SHOP_ID = 'YanaharaSHOP001';
    const AUTO_REGENERATE_DELAY = 2000; // 2秒後に次へ
    let currentExpectedTransactionId = null;
    let paymentStatusListener = null;

    // カメラ用
    let shopVideoObj = null;
    let shopRafId = null;
    let targetUserId = null;

    // --- 関数: 画面切り替え ---
    function showSection(section) {
        [mainShopSection, qrDisplaySection, shopScannerSection, remittanceAmountSection, paymentReceivedSection].forEach(sec => {
            sec.classList.add('hidden');
        });
        section.classList.remove('hidden');
    }

    // --- 関数: 支払い開始・QR生成 (再利用可能な関数に変更) ---
    function startPayment(amount) {
        // トランザクションID生成 (毎回新しくする)
        currentExpectedTransactionId = 'txn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        
        // QRデータ
        const qrData = JSON.stringify({
            shopId: SHOP_ID,
            amount: amount,
            transactionId: currentExpectedTransactionId
        });

        // Firebaseに支払い待ちリクエストを作成
        database.ref('payment_requests/' + currentExpectedTransactionId).set({
            shopId: SHOP_ID,
            amount: amount,
            status: 'pending',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        // 画面表示
        showSection(qrDisplaySection);
        qrCodeCanvas.innerHTML = '';
        new QRCode(qrCodeCanvas, {
            text: qrData,
            width: 200,
            height: 200
        });
        if(qrUrlText) qrUrlText.textContent = `ID: ${currentExpectedTransactionId}`;
        if(paymentStatusText) {
            paymentStatusText.innerHTML = '<span class="icon">⏳</span> 顧客からの支払い待ち...';
            paymentStatusText.className = 'status-pending';
        }

        // 監視開始
        if (paymentStatusListener) {
            // 前回のリスナーが生きていれば解除（念のため）
            // ただしIDが変わるのでパスも変わるが、変数のゴミ掃除として
            // ここではパスが動的なので、前のIDを保持していないと厳密には解除できないが
            // handlePaymentCompletedで解除しているので基本大丈夫
        }
        
        paymentStatusListener = database.ref('payment_status/' + currentExpectedTransactionId).on('value', (snapshot) => {
            const statusData = snapshot.val();
            if (statusData && statusData.status === 'completed') {
                // 完了処理へ
                handlePaymentCompleted(statusData.userId, amount);
            }
        });
    }

    // ボタンクリック時はここから開始
    generateQrBtn.addEventListener('click', () => {
        const amount = paymentAmountInput.value;
        if (!amount || amount <= 0) {
            alert("金額を入力してください");
            return;
        }
        startPayment(amount);
    });

    // --- 関数: 支払い完了処理 (連続支払いロジック追加) ---
    function handlePaymentCompleted(userId, amount) {
        // 監視解除
        database.ref('payment_status/' + currentExpectedTransactionId).off('value', paymentStatusListener);
        paymentStatusListener = null;
        
        // 履歴追加
        const li = document.createElement('li');
        li.className = 'payment';
        li.innerHTML = `
            <span>💰 入金: ${parseInt(amount).toLocaleString()}円</span>
            <span>Customer: ${userId.substr(0,6)}...</span>
        `;
        shopTransactionHistoryEl.insertBefore(li, shopTransactionHistoryEl.firstChild);

        receivedAmountEl.textContent = `¥ ${parseInt(amount).toLocaleString()}`;
        receivedCustomerInfoEl.textContent = `User: ${userId}`;
        showSection(paymentReceivedSection);

        // ★★★ 連続支払いロジック ★★★
        setTimeout(() => {
            // もし店員が手動で「金額入力に戻る」や「リセット」を押してメイン画面に戻っていたら
            // 自動再開はしない
            if (!mainShopSection.classList.contains('hidden')) return;

            // まだ完了画面のままなら、自動的に次の支払いQRを生成
            startPayment(amount);
        }, AUTO_REGENERATE_DELAY);
    }

    // --- 関数: 送金用カメラ (変更なし) ---
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
                console.error(err);
                alert("カメラを起動できませんでした");
                showSection(mainShopSection);
            });
    }

    function stopShopQrReader() {
        if (shopVideoObj) {
            shopVideoObj.getTracks().forEach(track => track.stop());
            shopVideoObj = null;
        }
    }

    function tickShopQr() {
        if (shopCameraVideo.readyState === shopCameraVideo.HAVE_ENOUGH_DATA) {
            shopQrCanvas.height = shopCameraVideo.videoHeight;
            shopQrCanvas.width = shopCameraVideo.videoWidth;
            const ctx = shopQrCanvas.getContext("2d");
            ctx.drawImage(shopCameraVideo, 0, 0, shopQrCanvas.width, shopQrCanvas.height);
            
            const imageData = ctx.getImageData(0, 0, shopQrCanvas.width, shopQrCanvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });

            if (code) {
                try {
                    const data = JSON.parse(code.data);
                    if (data.type === 'receive_money' && data.userId) {
                        stopShopQrReader();
                        targetUserId = data.userId;
                        targetUserIdDisplay.textContent = targetUserId;
                        remittanceAmountInput.value = '';
                        showSection(remittanceAmountSection);
                        return;
                    }
                } catch (e) {
                    // 無視
                }
            }
        }
        if (shopVideoObj) {
            requestAnimationFrame(tickShopQr);
        }
    }

    // --- イベントリスナー: 送金関連 ---
    startRemittanceBtn.addEventListener('click', startShopQrReader);

    cancelRemittanceBtn.addEventListener('click', () => {
        stopShopQrReader();
        showSection(mainShopSection);
    });

    backToScanBtn.addEventListener('click', startShopQrReader);

    confirmRemittanceBtn.addEventListener('click', async () => {
        const amount = parseInt(remittanceAmountInput.value);
        if (!amount || amount <= 0) {
            alert('金額を入力してください');
            return;
        }
        if (!confirm(`${amount}円を送金しますか？`)) return;

        // 送金実行 (Firebase)
        try {
            await database.ref('remittances/' + targetUserId).push({
                amount: amount,
                shopId: SHOP_ID,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });

            alert('送金完了しました！');
            
            // 履歴 (出金)
            const li = document.createElement('li');
            li.style.color = 'red';
            li.innerHTML = `
                <span>💸 送金: -${amount.toLocaleString()}円</span>
                <span>To: ${targetUserId.substr(0,6)}...</span>
            `;
            shopTransactionHistoryEl.insertBefore(li, shopTransactionHistoryEl.firstChild);
            
            showSection(mainShopSection);
        } catch (e) {
            alert('送金失敗: ' + e.message);
        }
    });

    // --- その他イベント ---
    resetAppBtn.addEventListener('click', () => {
        if (currentExpectedTransactionId && paymentStatusListener) {
            database.ref('payment_status/' + currentExpectedTransactionId).off('value', paymentStatusListener);
            paymentStatusListener = null;
        }
        showSection(mainShopSection);
        paymentAmountInput.value = '';
    });

    backToMainFromShopCompletionBtn.addEventListener('click', () => {
        // ここで手動で戻った場合は、タイマーの再生成処理はキャンセルされる（showSectionでhiddenが消えるため）
        showSection(mainShopSection);
        paymentAmountInput.value = '';
    });
});
