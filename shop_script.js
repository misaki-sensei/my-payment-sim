// shop_script.js (Firebase連携版 - 更新済み)
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const mainShopSection = document.getElementById('mainShopSection'); // 新しいDOMの親要素
    const paymentAmountInput = document.getElementById('paymentAmount');
    const generateQrBtn = document.getElementById('generateQrBtn');
    const qrDisplaySection = document.getElementById('qrDisplaySection');
    let qrCodeCanvas = document.getElementById('qrCodeCanvas');
    const qrUrlText = document.getElementById('qrUrlText'); // 追加された要素
    const paymentStatusText = document.getElementById('paymentStatusMessage'); // ID変更
    const receivedPaymentInfoEl = document.getElementById('paymentReceivedSection'); // ID変更
    const resetAppBtn = document.getElementById('resetAppBtn');
    const shopTransactionHistoryEl = document.getElementById('shopTransactionHistory');

    // 支払い完了時に表示する新しいセクションの要素
    const paymentReceivedSection = document.getElementById('paymentReceivedSection'); // 新しいセクション
    const receivedAmountEl = document.getElementById('receivedAmount'); // 新しいセクション内の要素
    const receivedCustomerInfoNewEl = document.getElementById('receivedCustomerInfo'); // 新しいセクション内の要素
    const backToMainFromShopCompletionBtn = document.getElementById('backToMainFromShopCompletionBtn');


    // --- 定数 ---
    const SHOP_ID = 'MOCKSHOP001';
    const LOCAL_STORAGE_SHOP_HISTORY_KEY = 'shopMockPayPayHistory'; // ローカル履歴は引き続きLocalStorage
    const COMPLETION_DISPLAY_TIME = 3000; // 完了メッセージ表示時間

    // Firebase Realtime Databaseのパス (店舗側と顧客側で共通)
    const PAYMENT_REQUEST_DB_PATH = 'paymentRequests/'; // 店舗側がQRコードに埋め込む取引情報
    const PAYMENT_STATUS_DB_PATH = 'paymentStatuses/'; // 顧客側が支払い完了時に送信するステータス

    // --- アプリの状態変数 ---
    let shopTransactions = [];
    let currentExpectedTransactionId = null; // 現在QRコードで提示している取引ID
    let qrCode = null; // QRCodeインスタンスを保持
    let paymentStatusListener = null; // Firebaseのリスナーを保持

    // --- 関数 ---
    const showSection = (sectionToShow) => {
        const sections = [mainShopSection, qrDisplaySection, paymentReceivedSection];
        sections.forEach(section => {
            if (section === sectionToShow) {
                section.classList.remove('hidden');
            } else {
                section.classList.add('hidden');
            }
        });
    };

    const updateShopHistoryDisplay = () => {
        shopTransactionHistoryEl.innerHTML = '';
        if (shopTransactions.length === 0) {
            const noHistoryItem = document.createElement('li');
            noHistoryItem.textContent = '入金履歴はありません。';
            shopTransactionHistoryEl.appendChild(noHistoryItem);
            return;
        }

        // 最新の履歴から表示
        for (let i = shopTransactions.length - 1; i >= 0; i--) {
            const transaction = shopTransactions[i];
            const listItem = document.createElement('li');
            listItem.classList.add('charge'); // 店舗側から見れば入金はチャージと似た色に

            const date = new Date(transaction.timestamp);
            const dateStr = date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
            const timeStr = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

            // 取引IDの末尾4桁を表示
            const shortTransactionId = transaction.transactionId ? transaction.transactionId.substring(transaction.transactionId.length - 4) : '';

            listItem.innerHTML = `
                <span>入金完了</span>
                <span>¥ ${transaction.amount.toLocaleString()}</span>
                <span class="history-date">${dateStr} ${timeStr} (${transaction.customerId || '不明な顧客'}) [${shortTransactionId}]</span>
            `;
            shopTransactionHistoryEl.appendChild(listItem);
        }
        localStorage.setItem(LOCAL_STORAGE_SHOP_HISTORY_KEY, JSON.stringify(shopTransactions));
    };

    const loadShopAppData = () => {
        shopTransactions = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SHOP_HISTORY_KEY)) || [];
    };

    const generateUniqueTransactionId = () => {
        return `${SHOP_ID}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    };

    const generateAndDisplayQrCode = async () => {
        const amount = parseFloat(paymentAmountInput.value);

        if (isNaN(amount) || amount <= 0) {
            alert('有効な金額を入力してください！');
            showSection(mainShopSection); // メインセクションに戻る
            return;
        }

        currentExpectedTransactionId = generateUniqueTransactionId();

        // 顧客IDは、デモ目的でダミーのIDを生成
        const dummyCustomerId = `USER-${Math.floor(Math.random() * 9000) + 1000}`;

        // QRコードに埋め込むデータ（クエリ文字列形式）
        // このデータを顧客側アプリが解析します
        const qrData = `amount=${amount}&shopId=${SHOP_ID}&transactionId=${currentExpectedTransactionId}&customerId=${dummyCustomerId}`;

        if (qrCodeCanvas) {
            // canvasの内容をクリアする
            const context = qrCodeCanvas.getContext('canvas');
            if (context) {
                context.clearRect(0, 0, qrCodeCanvas.width, qrCodeCanvas.height);
            }

            // 既存のQRCodeインスタンスがあればそれを再利用し、なければ新規作成
            if (qrCode) {
                qrCode.makeCode(qrData); // 既存インスタンスで新しいデータを描画
            } else {
                qrCode = new QRCode(qrCodeCanvas, {
                    text: qrData,
                    width: 200,
                    height: 200,
                    colorDark : "#000000",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.H
                });
            }
            qrCodeCanvas.setAttribute('aria-label', `支払い金額${amount.toLocaleString()}円のQRコード（店舗ID: ${SHOP_ID}, 取引ID: ${currentExpectedTransactionId}）`);
        } else {
            console.error('QRコードを描画するためのCanvas要素が見つかりません。HTMLを確認してください。');
            alert('QRコード表示に問題が発生しました。ブラウザのコンソールを確認してください。');
            showSection(mainShopSection);
            return;
        }

        showSection(qrDisplaySection); // QR表示セクションを表示
        qrUrlText.textContent = `QRデータ: ${qrData}`; // QRデータをテキストでも表示
        paymentStatusText.innerHTML = '<span class="icon">⏳</span> 顧客からの支払い待ち...';
        paymentStatusText.className = 'status-pending'; // ステータスを「保留中」の色に
        receivedPaymentInfoEl.classList.add('hidden'); // 入金情報エリアを非表示

        // Firebase Realtime Databaseに支払いリクエスト情報を書き込む
        try {
            await database.ref(PAYMENT_REQUEST_DB_PATH + currentExpectedTransactionId).set({
                amount: amount,
                shopId: SHOP_ID,
                transactionId: currentExpectedTransactionId,
                customerId: dummyCustomerId,
                timestamp: new Date().toISOString()
            });
            console.log("Payment request written to Firebase successfully.");
        } catch (error) {
            console.error("Firebaseへの書き込みエラー:", error);
            alert("支払いリクエストの送信中にエラーが発生しました。");
            showSection(mainShopSection);
            return;
        }

        // Firebase Realtime Databaseで顧客からの支払いステータスを監視
        listenForPaymentStatus();
    };

    const showPaymentReceivedCompletionSection = (paymentData) => {
        receivedAmountEl.textContent = `¥ ${paymentData.amount.toLocaleString()}`;
        receivedCustomerInfoNewEl.textContent = `顧客ID: ${paymentData.customerId || '不明'} (取引ID: ${paymentData.transactionId.substring(paymentData.transactionId.length - 4)})`;
        showSection(paymentReceivedSection); // 支払い完了セクションを表示

        // 一定時間後に自動でメイン画面に戻る
        setTimeout(() => {
            showSection(mainShopSection);
            paymentAmountInput.value = '0'; // 金額をリセット
        }, COMPLETION_DISPLAY_TIME);
    };


    const listenForPaymentStatus = () => {
        // 以前のリスナーがあれば解除
        if (paymentStatusListener) {
            database.ref(PAYMENT_STATUS_DB_PATH + currentExpectedTransactionId).off('value', paymentStatusListener);
            paymentStatusListener = null;
        }

        if (!currentExpectedTransactionId) {
            console.warn("監視する取引IDが設定されていません。");
            return;
        }

        // 指定された取引IDの支払いステータスを監視
        paymentStatusListener = database.ref(PAYMENT_STATUS_DB_PATH + currentExpectedTransactionId).on('value', (snapshot) => {
            const statusData = snapshot.val();

            if (statusData && statusData.status === 'success') {
                console.log("Payment received from Firebase:", statusData);
                paymentStatusText.innerHTML = `<span class="icon">✅</span> ¥ ${statusData.amount.toLocaleString()} が入金されました！`;
                paymentStatusText.className = 'status-success'; // ステータスを「成功」の色に
                receivedPaymentInfoEl.textContent = `取引ID: ${statusData.transactionId.substring(statusData.transactionId.length - 4)} (顧客: ${statusData.customerId || '不明'})`;
                receivedPaymentInfoEl.classList.remove('hidden');

                // 履歴に追加
                shopTransactions.push({
                    amount: statusData.amount,
                    timestamp: statusData.timestamp,
                    type: 'incoming',
                    transactionId: statusData.transactionId,
                    customerId: statusData.customerId || '不明な顧客'
                });
                updateShopHistoryDisplay();

                // 入金完了画面を表示
                showPaymentReceivedCompletionSection({
                    amount: statusData.amount,
                    customerId: statusData.comCustomerName || statusData.customerId, // 顧客名があればそれを使う、なければID
                    transactionId: statusData.transactionId
                });

                // 監視を停止し、現在の取引IDをクリア
                database.ref(PAYMENT_STATUS_DB_PATH + currentExpectedTransactionId).off('value', paymentStatusListener);
                paymentStatusListener = null;
                currentExpectedTransactionId = null;

                // Firebaseから支払いステータスを削除（この取引は完了したので）
                database.ref(PAYMENT_STATUS_DB_PATH + statusData.transactionId).remove().then(() => {
                    console.log("Payment status removed from Firebase after processing.");
                }).catch(error => {
                    console.error("Error removing payment status from Firebase:", error);
                });
            }
        }, (error) => {
            console.error("Firebaseリスナーエラー:", error);
            paymentStatusText.innerHTML = '⛔ 支払い監視中にエラーが発生しました。';
            paymentStatusText.className = 'status-error';
        });
    };

    // --- 初期化処理 ---
    loadShopAppData();
    updateShopHistoryDisplay();
    showSection(mainShopSection); // アプリ起動時はメイン画面を表示

    // --- イベントリスナー ---
    generateQrBtn.addEventListener('click', generateAndDisplayQrCode);

    resetAppBtn.addEventListener('click', async () => {
        showSection(mainShopSection); // メインセクションに戻る
        paymentAmountInput.value = '0';
        paymentStatusText.innerHTML = '<span class="icon">⏳</span> 顧客からの支払い待ち...';
        paymentStatusText.className = 'status-pending';
        receivedPaymentInfoEl.classList.add('hidden');
        qrUrlText.textContent = ''; // QRデータテキストをクリア

        // 監視中のリスナーがあれば解除
        if (paymentStatusListener) {
            database.ref(PAYMENT_STATUS_DB_PATH + currentExpectedTransactionId).off('value', paymentStatusListener);
            paymentStatusListener = null;
        }

        // Firebase上の現在の支払いリクエストとステータスをクリア
        if (currentExpectedTransactionId) {
            try {
                await database.ref(PAYMENT_REQUEST_DB_PATH + currentExpectedTransactionId).remove();
                console.log("Current payment request removed from Firebase.");
            } catch (error) {
                console.error("Error removing payment request from Firebase:", error);
            }
            try {
                await database.ref(PAYMENT_STATUS_DB_PATH + currentExpectedTransactionId).remove();
                console.log("Current payment status removed from Firebase."); // エラーメッセージ修正
            } catch (error) {
                console.error("Error removing payment status from Firebase:", error);
            }
        }
        currentExpectedTransactionId = null;

        // QRコード描画エリアをリセット (canvasの内容をクリアし、qrCodeインスタンスもnullにする)
        if (qrCodeCanvas) {
            const oldCanvas = qrCodeCanvas;
            const newCanvas = document.createElement('canvas');
            newCanvas.id = oldCanvas.id;
            newCanvas.className = oldCanvas.className;
            newCanvas.setAttribute('aria-label', '支払い金額未設定のQRコード表示エリア');
            oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
            qrCodeCanvas = document.getElementById('qrCodeCanvas'); // 新しいCanvas要素を再取得
            qrCode = null; // qrcodeインスタンスもリセット
        }
    });

    backToMainFromShopCompletionBtn.addEventListener('click', () => {
        showSection(mainShopSection);
        paymentAmountInput.value = '0'; // 金額をリセット
    });
});
