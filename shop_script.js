// shop_script.js

document.addEventListener('DOMContentLoaded', () => {
    // ... 既存の変数宣言 ...

    // --- 追加: 送金関連のDOM要素 ---
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

    // QRスキャン用変数
    let shopVideoObj = null;
    let shopRafId = null;
    let targetUserId = null; // 送金相手のID

    // --- 関数: カメラ起動 (Customer側と同様のロジック) ---
    function startShopQrReader() {
        showSection(shopScannerSection);
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(function(stream) {
                shopVideoObj = stream;
                shopCameraVideo.srcObject = stream;
                shopCameraVideo.setAttribute("playsinline", true);
                shopCameraVideo.play();
                requestAnimationFrame(tickShopQr);
            })
            .catch(function(err) {
                console.error("Camera Error:", err);
                alert("カメラを起動できませんでした。");
                showSection(mainShopSection);
            });
    }

    function stopShopQrReader() {
        if (shopVideoObj) {
            shopVideoObj.getTracks().forEach(track => track.stop());
            shopVideoObj = null;
        }
        if (shopRafId) {
            cancelAnimationFrame(shopRafId);
            shopRafId = null;
        }
    }

    function tickShopQr() {
        if (shopCameraVideo.readyState === shopCameraVideo.HAVE_ENOUGH_DATA) {
            shopQrCanvas.height = shopCameraVideo.videoHeight;
            shopQrCanvas.width = shopCameraVideo.videoWidth;
            const ctx = shopQrCanvas.getContext("2d");
            ctx.drawImage(shopCameraVideo, 0, 0, shopQrCanvas.width, shopQrCanvas.height);
            
            const imageData = ctx.getImageData(0, 0, shopQrCanvas.width, shopQrCanvas.height);
            // jsQRライブラリを使用
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });

            if (code) {
                // QR読み取り成功
                try {
                    const data = JSON.parse(code.data);
                    if (data.type === 'receive_money' && data.userId) {
                        // お客さんの受け取りQRだと判定
                        stopShopQrReader();
                        targetUserId = data.userId;
                        
                        // 金額入力画面へ
                        targetUserIdDisplay.textContent = targetUserId; // IDの一部を表示など
                        remittanceAmountInput.value = '';
                        showSection(remittanceAmountSection);
                        return;
                    }
                } catch (e) {
                    // JSONでない、または関係ないQR
                }
            }
        }
        shopRafId = requestAnimationFrame(tickShopQr);
    }

    // --- イベントリスナー ---

    startRemittanceBtn.addEventListener('click', () => {
        startShopQrReader();
    });

    cancelRemittanceBtn.addEventListener('click', () => {
        stopShopQrReader();
        showSection(mainShopSection);
    });

    backToScanBtn.addEventListener('click', () => {
        showSection(shopScannerSection);
        startShopQrReader();
    });

    // 送金実行ボタン
    confirmRemittanceBtn.addEventListener('click', async () => {
        const amount = parseInt(remittanceAmountInput.value);
        if (!amount || amount <= 0) {
            alert('正しい金額を入力してください');
            return;
        }

        if (!confirm(`${amount}円を送金しますか？`)) return;

        // Firebaseへ書き込み
        const REMITTANCE_PATH = 'remittances/';
        try {
            await database.ref(REMITTANCE_PATH + targetUserId).push({
                amount: amount,
                shopId: SHOP_ID,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });

            alert('送金が完了しました！');
            
            // 履歴に追加 (店舗側)
            const historyItem = document.createElement('li');
            historyItem.className = 'payment'; // 赤字（出金）として表示
            historyItem.innerHTML = `
                <span>💸 送金 (ID:${targetUserId.substr(0,4)}...)</span>
                <span>-¥${amount.toLocaleString()}</span>
            `;
            const shopTransactionHistoryEl = document.getElementById('shopTransactionHistory');
            shopTransactionHistoryEl.insertBefore(historyItem, shopTransactionHistoryEl.firstChild);

            showSection(mainShopSection);

        } catch (error) {
            console.error(error);
            alert('送金に失敗しました: ' + error.message);
        }
    });
});