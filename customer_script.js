document.addEventListener('DOMContentLoaded', () => {
    // --- 要素の取得 ---
    const mainSection = document.getElementById('main');
    const scannerSection = document.getElementById('scanner');
    const confirmSection = document.getElementById('confirmSection');
    const completionSection = document.getElementById('completionSection');
    const video = document.getElementById('cameraVideo');
    const canvasElement = document.getElementById('qrCanvas');
    const canvas = canvasElement.getContext('2d');

    const scanBtn = document.getElementById('scanBtn');
    const confirmShopName = document.getElementById('confirmShopName');
    const confirmAmount = document.getElementById('confirmAmount');
    const payBtn = document.getElementById('payBtn');
    const cancelPayBtn = document.getElementById('cancelPayBtn');

    let videoObj = null;
    let currentPaymentData = null;

    function showSection(section) {
        [mainSection, scannerSection, confirmSection, completionSection].forEach(s => s.classList.add('hidden'));
        section.classList.remove('hidden');
    }

    // --- カメラ・スキャン処理 (★修正ポイント) ---
    function startScanner() {
        showSection(scannerSection);
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
            videoObj = stream;
            video.srcObject = stream;
            video.setAttribute("playsinline", true);
            video.play();
            requestAnimationFrame(tick);
        });
    }

    function tick() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvasElement.height = video.videoHeight;
            canvasElement.width = video.videoWidth;
            canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
            const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (code) {
                try {
                    const data = JSON.parse(code.data);
                    if (data.shopId && data.amount) {
                        // 1. メッセージを「読み取りました」に変更
                        const statusText = scannerSection.querySelector('p');
                        if (statusText) {
                            statusText.innerText = "✅ 読み取りました！";
                            statusText.style.color = "#28a745";
                            statusText.style.fontWeight = "bold";
                        }

                        // 2. 0.3秒だけ待ってから遷移（ユーザーへの安心感）
                        setTimeout(() => {
                            stopCamera();
                            currentPaymentData = data;
                            confirmShopName.textContent = data.shopId;
                            confirmAmount.textContent = `¥ ${parseInt(data.amount).toLocaleString()}`;
                            showSection(confirmSection);

                            // 次回のためにメッセージを元に戻しておく
                            if (statusText) {
                                statusText.innerText = "店舗のQRコードをスキャンしてください";
                                statusText.style.color = "";
                                statusText.style.fontWeight = "";
                            }
                        }, 300);
                        return; // ループ終了
                    }
                } catch (e) {
                    // QRが不正な場合は無視
                }
            }
        }
        if (videoObj) requestAnimationFrame(tick);
    }

    function stopCamera() {
        if (videoObj) {
            videoObj.getTracks().forEach(track => track.stop());
            videoObj = null;
        }
    }

    // --- ボタンイベント ---
    scanBtn.onclick = startScanner;

    cancelPayBtn.onclick = () => {
        stopCamera();
        showSection(mainSection);
    };

    payBtn.onclick = async () => {
        if (!currentPaymentData) return;
        
        payBtn.disabled = true;
        payBtn.innerText = "支払い中...";

        try {
            const userId = "User_Guest"; // 本来はログインユーザーID
            // Firebaseへ支払い情報を書き込み
            await database.ref('paymentStatuses').push({
                shopId: currentPaymentData.shopId,
                amount: currentPaymentData.amount,
                transactionId: currentPaymentData.transactionId,
                customerId: userId,
                timestamp: new Date().toISOString()
            });

            document.getElementById('completedAmount').textContent = `¥ ${parseInt(currentPaymentData.amount).toLocaleString()}`;
            showSection(completionSection);
        } catch (e) {
            alert("支払いエラー: " + e.message);
        } finally {
            payBtn.disabled = false;
            payBtn.innerText = "支払いを確定する";
        }
    };

    document.getElementById('backToMainBtn').onclick = () => showSection(mainSection);
});
