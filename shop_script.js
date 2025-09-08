// shop_script.js (Firebase連携版 - 更新済み)
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const mainShopSection = document.getElementById('mainShopSection');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const generateQrBtn = document.getElementById('generateQrBtn');
    const qrDisplaySection = document.getElementById('qrDisplaySection');
    let qrCodeCanvas = document.getElementById('qrCodeCanvas');
    const qrUrlText = document.getElementById('qrUrlText');
    const paymentStatusText = document.getElementById('paymentStatusMessage');
    const receivedPaymentInfoEl = document.getElementById('paymentReceivedSection');
    const resetAppBtn = document.getElementById('resetAppBtn');
    const shopTransactionHistoryEl = document.getElementById('shopTransactionHistory');

    // 支払い完了時に表示する新しいセクションの要素
    const paymentReceivedSection = document.getElementById('paymentReceivedSection');
    const receivedAmountEl = document.getElementById('receivedAmount');
    const receivedCustomerInfoNewEl = document.getElementById('receivedCustomerInfo');
    const backToMainFromShopCompletionBtn = document.getElementById('backToMainFromShopCompletionBtn');


    // --- 定数 ---
    const SHOP_ID = 'MOCKSHOP001';
    const LOCAL_STORAGE_SHOP_HISTORY_KEY = 'shopMockPayPayHistory';
    const COMPLETION_DISPLAY_TIME = 3000;

    // Firebase Realtime Databaseのパス (店舗側と顧客側で共通)
    const PAYMENT_REQUEST_DB_PATH = 'paymentRequests/';
    const PAYMENT_STATUS_DB_PATH = 'paymentStatuses/';

    // --- アプリの状態変数 ---
    let shopTransactions = [];
    let currentExpectedTransactionId = null;
    let qrCode = null;
    let paymentStatusListener = null;

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
            listItem.classList.add('charge');

            const date = new Date(transaction.timestamp);
            const dateStr = date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
            const timeStr = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

            // 取引IDの末尾4桁を表示
            const shortTransactionId = transaction.transactionId ? transaction.transactionId.substring(transaction.transactionId.length - 4) : '';

            // ★変更箇所：入金完了と金額を1行で表示するように結合★
            listItem.innerHTML = `
                <span>入金完了 ¥ ${transaction.amount.toLocaleString()}</span>
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
        // ★修正点1: 金額を固定値にする★
        const amount = 1000; // 例として1000円に固定

        currentExpectedTransactionId = generateUniqueTransactionId();

        const dummyCustomerId = `USER-${Math.floor(Math.random() * 9000) + 1000}`;

        const qrData = `amount=${amount}&shopId=${SHOP_ID}&transactionId=${currentExpectedTransactionId}&customerId=${dummyCustomerId}`;

        if (qrCodeCanvas) {
            qrCodeCanvas.textContent = "";
            qrCode = new QRCode(qrCodeCanvas, {
                text: qrData,
                width: 200,
                height: 200,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });
            qrCodeCanvas.setAttribute('aria-label', `支払い金額${amount.toLocaleString()}円のQRコード（店舗ID: ${SHOP_ID}, 取引ID: ${currentExpectedTransactionId}）`);
        } else {
            console.error('QRコードを描画するためのCanvas要素が見つかりません。HTMLを確認してください。');
            alert('QRコード表示に問題が発生しました。ブラウザのコンソールを確認してください。');
            showSection(mainShopSection);
            return;
        }

        showSection(qrDisplaySection);
        qrUrlText.textContent = `QRデータ: ${qrData}`;
        paymentStatusText.innerHTML = '<span class="icon">⏳</span> 顧客からの支払い待ち...';
        paymentStatusText.className = 'status-pending';
        receivedPaymentInfoEl.classList.add('hidden');

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

        listenForPaymentStatus();
    };

    const showPaymentReceivedCompletionSection = (paymentData) => {
        receivedAmountEl.textContent = `¥ ${paymentData.amount.toLocaleString()}`;
        receivedCustomerInfoNewEl.textContent = `顧客ID: ${paymentData.customerId || '不明'} (取引ID: ${paymentData.transactionId.substring(paymentData.transactionId.length - 4)})`;
        showSection(paymentReceivedSection);

        setTimeout(() => {
            showSection(qrDisplaySection);
            // ★修正点2: 支払い完了後にQRコードを自動更新する★
            generateAndDisplayQrCode();
        }, COMPLETION_DISPLAY_TIME);
    };


    const listenForPaymentStatus = () => {
        if (paymentStatusListener) {
            database.ref(PAYMENT_STATUS_DB_PATH + currentExpectedTransactionId).off('value', paymentStatusListener);
            paymentStatusListener = null;
        }

        if (!currentExpectedTransactionId) {
            console.warn("監視する取引IDが設定されていません。");
            return;
        }

        paymentStatusListener = database.ref(PAYMENT_STATUS_DB_PATH + currentExpectedTransactionId).on('value', (snapshot) => {
            const statusData = snapshot.val();

            if (statusData && statusData.status === 'success') {
                console.log("Payment received from Firebase:", statusData);
                paymentStatusText.innerHTML = `<span class="icon">✅</span> ¥ ${statusData.amount.toLocaleString()} が入金されました！`;
                paymentStatusText.className = 'status-success';
                receivedPaymentInfoEl.textContent = `取引ID: ${statusData.transactionId.substring(statusData.transactionId.length - 4)} (顧客: ${statusData.customerId || '不明'})`;
                receivedPaymentInfoEl.classList.remove('hidden');

                shopTransactions.push({
                    amount: statusData.amount,
                    timestamp: statusData.timestamp,
                    type: 'incoming',
                    transactionId: statusData.transactionId,
                    customerId: statusData.customerId || '不明な顧客'
                });
                updateShopHistoryDisplay();

                showPaymentReceivedCompletionSection({
                    amount: statusData.amount,
                    customerId: statusData.comCustomerName || statusData.customerId,
                    transactionId: statusData.transactionId
                });

                database.ref(PAYMENT_STATUS_DB_PATH + currentExpectedTransactionId).off('value', paymentStatusListener);
                paymentStatusListener = null;
                // currentExpectedTransactionId は次のQR生成で更新されるのでここではnullにしない

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
    showSection(mainShopSection);

    // --- イベントリスナー ---
    generateQrBtn.addEventListener('click', generateAndDisplayQrCode);

    resetAppBtn.addEventListener('click', async () => {
        showSection(mainShopSection);
        paymentAmountInput.value = '0';
        paymentStatusText.innerHTML = '<span class="icon">⏳</span> 顧客からの支払い待ち...';
        paymentStatusText.className = 'status-pending';
        receivedPaymentInfoEl.classList.add('hidden');
        qrUrlText.textContent = '';

        if (paymentStatusListener) {
            database.ref(PAYMENT_STATUS_DB_PATH + currentExpectedTransactionId).off('value', paymentStatusListener);
            paymentStatusListener = null;
        }

        if (currentExpectedTransactionId) {
            // QRコードを更新せずにメイン画面に戻る場合、支払いリクエストを削除する
            try {
                await database.ref(PAYMENT_REQUEST_DB_PATH + currentExpectedTransactionId).remove();
                console.log("Current payment request removed from Firebase.");
            } catch (error) {
                console.error("Error removing payment request from Firebase:", error);
            }
            try {
                await database.ref(PAYMENT_STATUS_DB_PATH + currentExpectedTransactionId).remove();
                console.log("Current payment request removed from Firebase.");
            } catch (error) {
                console.error("Error removing payment status from Firebase:", error);
            }
        }
        currentExpectedTransactionId = null;
    });

    backToMainFromShopCompletionBtn.addEventListener('click', () => {
        showSection(mainShopSection);
        paymentAmountInput.value = '0';
    });
});
