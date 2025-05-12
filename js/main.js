document.addEventListener('DOMContentLoaded', () => {
    const videoElement = document.getElementById('video');
    const canvasElement = document.getElementById('canvas');
    const canvasCtx = canvasElement.getContext('2d');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const clearBtn = document.getElementById('clear-btn');
    const textOutputElement = document.getElementById('text-output').querySelector('p');
    const loadingIndicator = document.getElementById('loading-indicator'); // Jika masih dipakai

    // Elemen untuk Progress Bar
    const progressBarContainer = document.getElementById('progress-bar-container');
    const progressBar = document.getElementById('progress-bar');
    const loadingStatusText = document.getElementById('loading-status');

    // Elemen untuk Custom Popup
    const customPopupOverlay = document.getElementById('custom-popup-overlay');
    const customPopupTitle = document.getElementById('custom-popup-title');
    const customPopupMessage = document.getElementById('custom-popup-message');
    const customPopupCloseBtn = document.getElementById('custom-popup-close-btn');

    let stream = null;
    let hands = null;
    let onnxSession = null;
    let animationFrameId = null;
    let lastPredictedChar = ''; // Bisa juga menyimpan nama aksi terakhir
    let charBuffer = ''; // Untuk stabilisasi prediksi karakter atau aksi
    let predictionCounter = 0;
    const PREDICTION_THRESHOLD = 10; // Jumlah frame yang sama sebelum karakter/aksi dianggap stabil

    // --- KONFIGURASI PENTING (SESUAIKAN!) ---
    const NUM_FEATURES = 42;
    const ONNX_MODEL_INPUT_NAME = 'float_input';
    const ONNX_MODEL_OUTPUT_NAME = 'label'; // Sesuai dengan output terakhir Anda
    const ONNX_MODEL_PATH = "model/sibi_rf_model.onnx"; // Pastikan path ini benar
    // -----------------------------------------

    // Fungsi untuk menampilkan popup kustom
    function showCustomPopup(title, message) {
        if (customPopupTitle) customPopupTitle.textContent = title;
        if (customPopupMessage) customPopupMessage.textContent = message;
        if (customPopupOverlay) customPopupOverlay.style.display = 'flex';
    }

    // Fungsi untuk menyembunyikan popup kustom
    function hideCustomPopup() {
        if (customPopupOverlay) customPopupOverlay.style.display = 'none';
    }

    // Event listener untuk tombol tutup popup
    if (customPopupCloseBtn) {
        customPopupCloseBtn.addEventListener('click', hideCustomPopup);
    }
    if (customPopupOverlay) {
        customPopupOverlay.addEventListener('click', (event) => {
            if (event.target === customPopupOverlay) { // Hanya jika klik pada overlay
                hideCustomPopup();
            }
        });
    }

    // Fungsi untuk update progress bar
    function updateProgress(value, statusText = "Memuat...") {
        const percentage = Math.min(Math.max(value, 0), 100);
        if (progressBar) {
            progressBar.style.width = percentage + '%';
            progressBar.textContent = percentage + '%';
        }
        if (loadingStatusText) {
            loadingStatusText.textContent = statusText;
        }
    }

    // --- 1. Inisialisasi dan Pemuatan Model ---
    async function initialize() {
        if (textOutputElement) {
            textOutputElement.textContent = "Sedang memuat model AI, mohon tunggu...";
        }
        if (progressBarContainer) progressBarContainer.style.display = 'block';
        if (loadingStatusText) loadingStatusText.style.display = 'block';
        updateProgress(0, "Menginisialisasi MediaPipe...");

        hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1, // Coba 0 untuk performa lebih baik jika perlu
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
        });

        hands.onResults(onResults);
        updateProgress(30, "MediaPipe siap. Memuat model AI...");

        try {
            if(loadingIndicator) loadingIndicator.style.display = 'flex';
            onnxSession = await ort.InferenceSession.create(ONNX_MODEL_PATH, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all'
            });
            updateProgress(100, "Model AI berhasil dimuat!");
            console.log("ONNX model loaded successfully.");
            if (textOutputElement) {
                textOutputElement.textContent = "Model siap. Klik 'Mulai Kamera'.";
            }
            setTimeout(() => {
                if (progressBarContainer) progressBarContainer.style.display = 'none';
                if (loadingStatusText) loadingStatusText.style.display = 'none';
            }, 1000); // Jeda agar pengguna bisa baca status berhasil

        } catch (error) {
            console.error("Failed to load ONNX model:", error);
            updateProgress(100, "Gagal memuat model AI!");
            if (textOutputElement) {
                textOutputElement.textContent = "Gagal memuat model AI. Silakan coba lagi.";
            }
            showCustomPopup("Kesalahan Pemuatan Model", `Gagal memuat model AI. Pastikan file model ada di '${ONNX_MODEL_PATH}' dan server dapat menyajikannya. Coba segarkan halaman.`);
        } finally {
            if(loadingIndicator) loadingIndicator.style.display = 'none';
        }
    }

    // --- 2. Fungsi untuk Menjalankan Kamera dan Deteksi ---
    async function startCamera() {
        if (!onnxSession) {
            showCustomPopup("Model Belum Siap", "Model AI belum sepenuhnya dimuat. Mohon tunggu beberapa saat atau segarkan halaman jika masalah berlanjut.");
            return;
        }

        // Tampilkan indikator loading SEGERA
        if (loadingStatusText) {
            loadingStatusText.textContent = "Memulai kamera, mohon tunggu...";
            loadingStatusText.style.display = 'block';
        }
        if (loadingIndicator) {
            loadingIndicator.style.display = 'flex';
        }
        // Bersihkan canvas dari frame sebelumnya jika ada
        if (canvasCtx && canvasElement.width > 0 && canvasElement.height > 0) {
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        }
        // canvasElement.style.display = 'none'; // Opsional, sembunyikan canvas sementara

        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
            videoElement.srcObject = stream;
            videoElement.style.display = 'none'; // Video asli tetap tersembunyi

            videoElement.onloadedmetadata = () => {
                videoElement.play();
                canvasElement.width = videoElement.videoWidth;
                canvasElement.height = videoElement.videoHeight;

                canvasElement.style.display = 'block'; // Tampilkan canvas SEKARANG

                startBtn.disabled = true;
                stopBtn.disabled = false;
                if (textOutputElement) {
                    textOutputElement.textContent = "Arahkan tangan Anda ke kamera...";
                }

                if (loadingStatusText) loadingStatusText.style.display = 'none';
                if (loadingIndicator) loadingIndicator.style.display = 'none';

                requestAnimationFrame(predictionLoop);
            };
        } catch (error) {
            console.error("Error accessing webcam:", error);
            if (textOutputElement) {
                textOutputElement.textContent = "Tidak bisa mengakses kamera. Pastikan izin diberikan.";
            }
            if (loadingStatusText) loadingStatusText.style.display = 'none';
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            // if (canvasElement.style.display === 'none') canvasElement.style.display = 'block'; // Tampilkan kembali canvas jika disembunyikan
            showCustomPopup("Kesalahan Kamera", "Tidak bisa mengakses kamera. Pastikan Anda memberikan izin dan tidak ada aplikasi lain yang menggunakannya.");
        }
    }

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        videoElement.srcObject = null;
        videoElement.style.display = 'none';

        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        // Opsi: Bersihkan canvas atau tampilkan pesan saat kamera berhenti
        // if (canvasCtx && canvasElement.width > 0 && canvasElement.height > 0) {
        //     canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        // }


        startBtn.disabled = false;
        stopBtn.disabled = true; // Tombol stop di-disable karena kamera sudah berhenti
        if (textOutputElement) {
            textOutputElement.textContent = "Kamera dihentikan. Klik 'Mulai Kamera' untuk memulai lagi.";
        }
        lastPredictedChar = '';
        charBuffer = '';
        predictionCounter = 0;
    }

    function clearText() {
        if (textOutputElement) {
            textOutputElement.textContent = "Mulai kamera untuk menerjemahkan isyarat...";
        }
        lastPredictedChar = '';
        charBuffer = '';
        predictionCounter = 0;
    }

    // --- 3. Loop Deteksi dan Prediksi ---
    async function predictionLoop() {
        if (videoElement.readyState >= videoElement.HAVE_ENOUGH_DATA && hands && onnxSession) {
            await hands.send({ image: videoElement });
        }
        animationFrameId = requestAnimationFrame(predictionLoop);
    }

    // --- onResults dengan penanganan gestur khusus (label '1', '2', '3', '4') ---
    async function onResults(results) {
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            for (const landmarks of results.multiHandLandmarks) {
                drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
                drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 2, radius: 3 });

                const extractedLandmarks = extractAndNormalizeLandmarks(landmarks);

                if (extractedLandmarks.length === NUM_FEATURES) {
                    try {
                        const inputTensor = new ort.Tensor('float32', Float32Array.from(extractedLandmarks), [1, NUM_FEATURES]);
                        const feeds = { [ONNX_MODEL_INPUT_NAME]: inputTensor };
                        const outputMap = await onnxSession.run(feeds);

                        if (outputMap[ONNX_MODEL_OUTPUT_NAME]) {
                            const outputTensor = outputMap[ONNX_MODEL_OUTPUT_NAME];
                            if (outputTensor.data && outputTensor.data.length > 0) {
                                const predictedLabelRaw = outputTensor.data[0];
                                let charToAdd = null;
                                let performAction = null;

                                switch (predictedLabelRaw) {
                                    case '1': performAction = 'backspace'; break;
                                    case '2': performAction = 'clear'; break;
                                    case '3': performAction = 'space'; break;
                                    case '4': break; // Abaikan '4'
                                    default: charToAdd = predictedLabelRaw; break;
                                }

                                if (performAction) {
                                    if (performAction === charBuffer) { predictionCounter++; }
                                    else { charBuffer = performAction; predictionCounter = 0; }

                                    if (predictionCounter >= PREDICTION_THRESHOLD && performAction !== lastPredictedChar) {
                                        if (performAction === 'backspace') {
                                            if (textOutputElement.textContent.length > 0 &&
                                                !textOutputElement.textContent.startsWith("Sedang memuat") &&
                                                !textOutputElement.textContent.startsWith("Model siap") &&
                                                !textOutputElement.textContent.startsWith("Arahkan tangan") &&
                                                !textOutputElement.textContent.startsWith("Mulai kamera") &&
                                                !textOutputElement.textContent.startsWith("Kamera dihentikan")) {
                                                textOutputElement.textContent = textOutputElement.textContent.slice(0, -1);
                                                if (textOutputElement.textContent.length === 0) { // Jika jadi kosong setelah backspace
                                                    textOutputElement.textContent = "Mulai kamera untuk menerjemahkan isyarat...";
                                                }
                                            }
                                        } else if (performAction === 'clear') {
                                            textOutputElement.textContent = "Mulai kamera untuk menerjemahkan isyarat...";
                                        } else if (performAction === 'space') {
                                            if (textOutputElement.textContent.startsWith("Sedang memuat") ||
                                                textOutputElement.textContent.startsWith("Model siap") ||
                                                textOutputElement.textContent.startsWith("Arahkan tangan") ||
                                                textOutputElement.textContent.startsWith("Mulai kamera") ||
                                                textOutputElement.textContent.startsWith("Kamera dihentikan")) {
                                                textOutputElement.textContent = ' '; // Mulai dengan spasi jika teks output adalah placeholder
                                            } else {
                                                textOutputElement.textContent += ' ';
                                            }
                                        }
                                        lastPredictedChar = performAction;
                                        predictionCounter = 0;
                                    }
                                } else if (charToAdd) {
                                    if (charToAdd === charBuffer) { predictionCounter++; }
                                    else { charBuffer = charToAdd; predictionCounter = 0; }

                                    if (predictionCounter >= PREDICTION_THRESHOLD && charToAdd !== lastPredictedChar) {
                                        if (textOutputElement.textContent.startsWith("Sedang memuat") ||
                                            textOutputElement.textContent.startsWith("Model siap") ||
                                            textOutputElement.textContent.startsWith("Arahkan tangan") ||
                                            textOutputElement.textContent.startsWith("Mulai kamera") ||
                                            textOutputElement.textContent.startsWith("Kamera dihentikan")) {
                                            textOutputElement.textContent = ''; // Hapus placeholder
                                        }
                                        textOutputElement.textContent += charToAdd;
                                        lastPredictedChar = charToAdd;
                                        predictionCounter = 0;
                                    }
                                } else { // Jika '4' atau tidak ada aksi/char (predictedLabelRaw adalah '4' atau undefined)
                                    if (charBuffer !== '' && charBuffer !== '4' && charBuffer !== predictedLabelRaw) {
                                        charBuffer = predictedLabelRaw; // Set buffer ke '4' atau undefined
                                        predictionCounter = 0;
                                    }
                                }
                            }
                        } else {
                            console.error(`Output name '${ONNX_MODEL_OUTPUT_NAME}' not found in ONNX outputMap. Available outputs:`, Object.keys(outputMap));
                        }
                    } catch (error) {
                        console.error("Error during ONNX inference:", error);
                        if (error.stack) console.error(error.stack);
                    }
                }
            }
        } else { // Tidak ada tangan terdeteksi
            if (charBuffer !== '') { charBuffer = ''; predictionCounter = 0; }
        }
        canvasCtx.restore();
    }

    // --- 4. Fungsi Helper untuk Ekstraksi dan Normalisasi Landmark ---
    function extractAndNormalizeLandmarks(handLandmarks) {
        const landmarksArray = [];
        if (!handLandmarks || handLandmarks.length === 0) { return landmarksArray; }
        const rawXCoordinates = [];
        const rawYCoordinates = [];
        for (const landmark of handLandmarks) {
            rawXCoordinates.push(landmark.x);
            rawYCoordinates.push(landmark.y);
        }
        const minX = Math.min(...rawXCoordinates);
        const minY = Math.min(...rawYCoordinates);
        for (const landmark of handLandmarks) {
            landmarksArray.push(landmark.x - minX);
            landmarksArray.push(landmark.y - minY);
        }
        return landmarksArray.slice(0, NUM_FEATURES);
    }

    // --- Event Listeners ---
    startBtn.addEventListener('click', startCamera);
    stopBtn.addEventListener('click', stopCamera);
    clearBtn.addEventListener('click', clearText);

    // Inisialisasi saat halaman dimuat
    initialize();
});