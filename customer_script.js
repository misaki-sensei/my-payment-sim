document.addEventListener('DOMContentLoaded', () => {
    // 顧客IDの表示（デモンストレーション用）
    const customerIdDisplay = document.getElementById('customer-id-display');
    if (customerIdDisplay) {
        let customerId = localStorage.getItem('currentCustomerId');
        if (!customerId) {
            customerId = 'CUST' + Date.now(); // 仮の顧客IDを生成
            localStorage.setItem('currentCustomerId', customerId);
        }
        customerIdDisplay.textContent = customerId;
    }

    // 残高表示の更新
    updateBalanceDisplay();
    // 履歴表示の更新
    updateHistoryDisplay();

    // セクション表示を制御する要素
    const mainActionsSection = document.getElementById('main-actions-section');
    const paySection = document.getElementById('pay-section');
    const chargeSection = document.getElementById('charge-section');
    const completionSection = document.getElementById('completion-section');
    const historySection = document.getElementById('history-section');

    // ボタン要素
    const showPayButton = document.getElementById('show-pay-section');
    const showChargeButton = document.getElementById('show-charge-section');
    const backToMainFromPayButton = document.getElementById('back-to-main-from-pay');
    const backToMainFromChargeButton = document.getElementById('back-to-main-from-charge');
    const backToMainFromCompletionButton = document.getElementById('back-to-main-from-completion');
    const payButton = document.getElementById('pay-button');
    const chargeButton = document.getElementById('charge-button');
    const chargeAmountInput = document.getElementById('charge-amount');
    const predictedBalanceDisplay = document.getElementById('predicted-balance-display');

    // QRコードリーダー関連
    const qrCameraVideo = document.getElementById('qr-camera-video');
    const qrCameraCanvas = document.getElementById('qr-camera-canvas');
    const cameraStatus = document.getElementById('camera-status');
    const readAmountDisplay = document.getElementById('read-amount-display');
    const qrInstruction = document.getElementById('qr-instruction');

    let html5QrCodeScanner; // QRコードスキャナーのインスタンスを保持する変数

    // 初期表示設定
    showSection(mainActionsSection);

    showPayButton.addEventListener('click', () => {
        showSection(paySection);
        startQrScanner();
    });

    showChargeButton.addEventListener('click', () => {
        showSection(chargeSection);
        updatePredictedBalance(); // チャージ画面表示時に予測残高を更新
    });

    backToMainFromPayButton.addEventListener('click', () => {
        showSection(mainActionsSection);
        stopQrScanner();
    });

    backToMainFromChargeButton.addEventListener('click', () => {
        showSection(mainActionsSection);
    });

    backToMainFromCompletionButton.addEventListener('click', () => {
        showSection(mainActionsSection);
        // 完了メッセージをリセット
        document.getElementById('payment-completion-card').classList.add('hidden');
        document.getElementById('charge-completion-card').classList.add('hidden');
    });

    // 支払いボタンのイベントリスナー
    payButton.addEventListener('click', () => {
        const amountText = readAmountDisplay.querySelector('span').textContent;
        const amount = parseInt(amountText.replace(/¥|,/g, '')); // ¥記号とカンマを除去して数値に変換
        const currentShopId = payButton.dataset.shopId; // datasetからshopIdを取得
        const currentTransactionId = payButton.dataset.transactionId; // datasetからtransactionIdを取得

        if (amount > 0 && currentShopId && currentTransactionId) {
            processPayment(amount, currentShopId, currentTransactionId);
        } else {
            alert('支払い情報が不正です。再度QRコードを読み込んでください。');
        }
    });

    // チャージボタンのイベントリスナー
    chargeButton.addEventListener('click', () => {
        const amount = parseInt(chargeAmountInput.value);
        if (amount > 0) {
            processCharge(amount);
            chargeAmountInput.value = '';
        } else {
            alert('有効な金額を入力してください。');
        }
    });

    // チャージ金額入力時に予測残高を更新
    chargeAmountInput.addEventListener('input', updatePredictedBalance);

    // 履歴クリアボタンのイベントリスナー
    const clearHistoryButton = document.getElementById('clear-customer-history');
    if (clearHistoryButton) {
        clearHistoryButton.addEventListener('click', () => {
            if (confirm('顧客の履歴と残高をすべて削除してもよろしいですか？')) {
                localStorage.removeItem('customerHistory');
                localStorage.setItem('customerBalance', '0'); // 残高を0にリセット
                updateBalanceDisplay();
                updateHistoryDisplay();
            }
        });
    }

    // URLパラメータから支払い情報があれば処理
    const urlParams = new URLSearchParams(window.location.search);
    const paramAmount = urlParams.get('amount');
    const paramShopId = urlParams.get('shopId');

    if (paramAmount && paramShopId) {
        // 店舗側からリダイレクトされた場合、支払い完了画面を表示
        const transactionIdFromShop = urlParams.get('transactionId');
        if (transactionIdFromShop) {
            showCompletionScreen('payment', parseInt(paramAmount), paramShopId, transactionIdFromShop);
        }
    }


    function showSection(sectionToShow) {
        // すべてのセクションを非表示にする
        [mainActionsSection, paySection, chargeSection, completionSection, historySection].forEach(section => {
            section.classList.add('hidden');
        });
        // 指定されたセクションを表示する
        sectionToShow.classList.remove('hidden');

        // QRスキャナーの状態を管理
        if (sectionToShow === paySection) {
            startQrScanner();
        } else {
            stopQrScanner();
        }
    }

    function startQrScanner() {
        if (html5QrCodeScanner) {
            // 既存のスキャナーインスタンスがあれば停止してから再開
            html5QrCodeScanner.stop().then(() => {
                startActualScanner();
            }).catch(err => {
                console.error("Failed to stop existing scanner:", err);
                startActualScanner(); // 停止に失敗しても再開を試みる
            });
        } else {
            startActualScanner();
        }
    }

    function startActualScanner() {
        if (!html5QrCodeScanner) {
            html5QrCodeScanner = new Html5Qrcode("qr-camera-video");
        }

        const qrCodeSuccessCallback = (decodedText, decodedResult) => {
            console.log(`QR Decoded: ${decodedText}`);
            stopQrScanner(); // 読み取り成功したらスキャナーを停止

            try {
                const url = new URL(decodedText);
                const amount = url.searchParams.get('amount');
                const shopId = url.searchParams.get('shopId');
                // 店舗側が生成したtransactionIdもQRから受け取る
                const transactionId = url.searchParams.get('transactionId'); 

                if (amount && shopId) {
                    readAmountDisplay.querySelector('span').textContent = parseInt(amount).toLocaleString();
                    readAmountDisplay.classList.remove('hidden');
                    payButton.classList.remove('hidden');
                    qrInstruction.textContent = `${shopId}への支払い金額を確認してください。`;
                    
                    // 支払いボタンに金額、店舗ID、取引IDをデータ属性として保存
                    payButton.dataset.amount = amount;
                    payButton.dataset.shopId = shopId;
                    payButton.dataset.transactionId = transactionId || 'N/A'; // ない場合も考慮
                } else {
                    alert('無効なQRコードです。金額と店舗IDが含まれていません。');
                    readAmountDisplay.classList.add('hidden');
                    payButton.classList.add('hidden');
                    qrInstruction.textContent = 'カメラをQRコードに向けてください。';
                    startQrScanner(); // 再度スキャンを開始
                }
            } catch (e) {
                alert('無効なQRコード形式です。');
                console.error("QR parse error:", e);
                readAmountDisplay.classList.add('hidden');
                payButton.classList.add('hidden');
                qrInstruction.textContent = 'カメラをQRコードに向けてください。';
                startQrScanner(); // 再度スキャンを開始
            }
        };

        const config = { fps: 10, qrbox: { width: 200, height: 200 } };
        const videoElement = document.getElementById("qr-camera-video");
        videoElement.style.visibility = 'visible'; // ビデオ要素を表示

        html5QrCodeScanner.start({ facingMode: "environment" }, config, qrCodeSuccessCallback,
            (errorMessage) => {
                // スキャンエラーや継続的なエラーの処理
                cameraStatus.textContent = 'カメラエラー: ' + errorMessage;
                console.warn(errorMessage);
            })
        .then(() => {
            cameraStatus.textContent = 'カメラ起動中...';
        })
        .catch((err) => {
            cameraStatus.textContent = 'カメラの起動に失敗しました。';
            console.error("Camera start failed:", err);
            videoElement.style.visibility = 'hidden'; // エラー時は非表示に戻す
        });
    }

    function stopQrScanner() {
        if (html5QrCodeScanner && html5QrCodeScanner.is
            Scanning) { // isScanningプロパティで確認
            html5QrCodeScanner.stop().then(() => {
                console.log("QR scanner stopped.");
                const videoElement = document.getElementById("qr-camera-video");
                videoElement.style.visibility = 'hidden'; // ビデオ要素を非表示に
                cameraStatus.textContent = 'スキャナー停止中';
            }).catch((err) => {
                console.error("Failed to stop QR scanner:", err);
            });
        }
    }

    function updateBalanceDisplay() {
        const balanceDisplay = document.getElementById('balance-display');
        if (balanceDisplay) {
            const balance = parseInt(localStorage.getItem('customerBalance')) || 0;
            balanceDisplay.textContent = balance.toLocaleString();
        }
    }

    function updatePredictedBalance() {
        const currentBalance = parseInt(localStorage.getItem('customerBalance')) || 0;
        const chargeAmount = parseInt(chargeAmountInput.value) || 0;
        const predictedBalance = currentBalance + chargeAmount;
        predictedBalanceDisplay.querySelector('span').textContent = predictedBalance.toLocaleString();
        predictedBalanceDisplay.classList.remove('hidden');
    }

    function updateHistoryDisplay() {
        const historyList = document.getElementById('customer-history-list');
        if (!historyList) return;

        historyList.innerHTML = '';
        let customerHistory = JSON.parse(localStorage.getItem('customerHistory')) || [];

        // 最新の履歴が上に来るように逆順にする
        customerHistory.slice().reverse().forEach(transaction => {
            const listItem = document.createElement('li');
            const shortTransactionId = transaction.id ? transaction.id.substring(0, 8) : 'N/A'; // 取引IDを短縮、ない場合はN/A

            if (transaction.type === 'payment') {
                // 修正点：支払いと金額を1行に表示
                listItem.innerHTML = `
                    <span>支払い ¥ ${transaction.amount.toLocaleString()}</span>
                    <span class="history-date">${formatDate(transaction.timestamp)} ${transaction.shopId ? `(${transaction.shopId})` : ''} [${shortTransactionId}]</span>
                `;
                listItem.classList.add('payment'); // CSSクラスを適用
            } else if (transaction.type === 'charge') {
                // 修正点：チャージと金額を1行に表示
                listItem.innerHTML = `
                    <span>チャージ ¥ ${transaction.amount.toLocaleString()}</span>
                    <span class="history-date">${formatDate(transaction.timestamp)}</span>
                `;
                listItem.classList.add('charge'); // CSSクラスを適用
            }
            historyList.appendChild(listItem);
        });
    }

    function processPayment(amount, shopId, transactionId) {
        let balance = parseInt(localStorage.getItem('customerBalance')) || 0;
        let customerHistory = JSON.parse(localStorage.getItem('customerHistory')) || [];
        let customerId = localStorage.getItem('currentCustomerId'); // 顧客IDを取得

        if (balance >= amount) {
            balance -= amount;
            localStorage.setItem('customerBalance', balance);

            customerHistory.push({
                id: transactionId, // 店舗側から受け取った取引IDを使用
                type: 'payment',
                amount: amount,
                timestamp: new Date().toISOString(),
                shopId: shopId // どの店舗に支払ったか
            });
            localStorage.setItem('customerHistory', JSON.stringify(customerHistory));

            updateBalanceDisplay();
            updateHistoryDisplay();

            // 店舗側に支払い完了を通知する（ここではシミュレーションとしてURLリダイレクト）
            // 実際にはFetch APIなどでサーバーサイドAPIを呼び出す
            const shopAppUrl = window.location.origin + '/shop.html';
            window.location.href = `${shopAppUrl}?transactionId=${transactionId}&amount=${amount}&customerId=${customerId}`;

        } else {
            alert('残高が不足しています。');
        }
    }

    function processCharge(amount) {
        let balance = parseInt(localStorage.getItem('customerBalance')) || 0;
        let customerHistory = JSON.parse(localStorage.getItem('customerHistory')) || [];
        const transactionId = 'CHARGE' + Date.now() + Math.floor(Math.random() * 1000); // チャージの取引ID

        balance += amount;
        localStorage.setItem('customerBalance', balance);

        customerHistory.push({
            id: transactionId, // チャージにも取引ID
            type: 'charge',
            amount: amount,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('customerHistory', JSON.stringify(customerHistory));

        updateBalanceDisplay();
        updateHistoryDisplay();
        showCompletionScreen('charge', amount); // チャージ完了画面を表示
    }

    function showCompletionScreen(type, amount, shopId = '', transactionId = '') {
        showSection(completionSection);
        if (type === 'payment') {
            document.getElementById('payment-completion-card').classList.remove('hidden');
            document.getElementById('completed-payment-amount').textContent = amount.toLocaleString();
            document.getElementById('payment-completed-shop-id').textContent = shopId;
            document.getElementById('payment-completed-transaction-id').textContent = transactionId;
        } else if (type === 'charge') {
            document.getElementById('charge-completion-card').classList.remove('hidden');
            document.getElementById('completed-charge-amount').textContent = amount.toLocaleString();
        }
    }


    function formatDate(isoString) {
        const date = new Date(isoString);
        // 日本のロケールとオプションで日付と時刻をフォーマット
        return date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }) + ' ' + date.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
});
