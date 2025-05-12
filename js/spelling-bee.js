document.addEventListener('DOMContentLoaded', () => {
    // Elemen DOM
    const videoElement = document.getElementById('game-video');
    const canvasElement = document.getElementById('game-canvas');
    const canvasCtx = canvasElement.getContext('2d');
    const startGameBtn = document.getElementById('start-game-btn');
    const stopCameraBtn = document.getElementById('stop-camera-btn');
    const wordDisplayElement = document.getElementById('word-to-spell-display');
    const detectedCharDisplayElement = document.getElementById('detected-char-display');
    const nextWordBtn = document.getElementById('next-word-btn');
    const scoreElement = document.getElementById('score'); // Pastikan ada di HTML
    const wordsCompletedElement = document.getElementById('words-completed'); // Pastikan ada di HTML

    const progressBarContainer = document.getElementById('progress-bar-container');
    const progressBar = document.getElementById('progress-bar');
    const loadingStatusText = document.getElementById('loading-status');

    const customPopupOverlay = document.getElementById('custom-popup-overlay');
    const customPopupTitle = document.getElementById('custom-popup-title');
    const customPopupMessage = document.getElementById('custom-popup-message');
    const customPopupCloseBtn = document.getElementById('custom-popup-close-btn');

    // Variabel
    let hands;
    let onnxSession = null;
    let cameraActive = false;
    let animationFrameId_game;
    let gameStream = null;

    let modelReady = false; // Untuk status ONNX model
    let mediaPipeReady = false;

    // Variabel Game
    let currentWord = "";
    let currentLetterIndex = 0;
    let score = 0;
    let wordsCompleted = 0;
    let charBuffer = '';
    let predictionCounter = 0;
    const PREDICTION_THRESHOLD_GAME = 8;
    const wordList = ["BALI", "BUDI", "CINTA", "API", "AIR", "IBU", "AYAH", "ANAK", "KATA", "BACA"];

    // Konfigurasi Model ONNX
    const NUM_FEATURES = 42;
    const ONNX_MODEL_INPUT_NAME = 'float_input';
    const ONNX_MODEL_OUTPUT_NAME = 'label';
    const ONNX_MODEL_PATH = "model/sibi_rf_model.onnx";

    // --- Fungsi UI Helper ---
    function showCustomPopup(title, message) {
        if (customPopupTitle) customPopupTitle.textContent = title;
        if (customPopupMessage) customPopupMessage.textContent = message;
        if (customPopupOverlay) customPopupOverlay.style.display = 'flex';
    }
    function hideCustomPopup() {
        if (customPopupOverlay) customPopupOverlay.style.display = 'none';
    }
    if (customPopupCloseBtn) customPopupCloseBtn.addEventListener('click', hideCustomPopup);
    if (customPopupOverlay) customPopupOverlay.addEventListener('click', (e) => { if (e.target === customPopupOverlay) hideCustomPopup(); });

    function updateProgress(value, statusText = "Memuat...") {
        const percentage = Math.min(Math.max(value, 0), 100);
        if (progressBar) { progressBar.style.width = percentage + '%'; progressBar.textContent = percentage + '%'; }
        if (loadingStatusText) loadingStatusText.textContent = statusText;
    }

    // --- TAHAP 1: Inisialisasi MediaPipe Hands ---
    async function initializeMediaPipe() {
        console.log("Initializing MediaPipe Hands...");
        if (wordDisplayElement) wordDisplayElement.textContent = "Inisialisasi MediaPipe...";
        if (progressBarContainer) progressBarContainer.style.display = 'block';
        if (loadingStatusText) loadingStatusText.style.display = 'block';
        updateProgress(10, "Inisialisasi MediaPipe...");

        return new Promise((resolve, reject) => {
            try {
                hands = new Hands({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
                });
                hands.setOptions({
                    maxNumHands: 1, modelComplexity: 0,
                    minDetectionConfidence: 0.7, minTrackingConfidence: 0.7
                });
                hands.onResults(onHandResults);
                mediaPipeReady = true;
                console.log("MediaPipe Hands object created and options set.");
                updateProgress(30, "MediaPipe Siap.");
                resolve(true);
            } catch (error) {
                console.error("CRITICAL ERROR initializing MediaPipe Hands object:", error);
                mediaPipeReady = false;
                reject(error);
            }
        });
    }

    // --- TAHAP 2: Inisialisasi Model ONNX (Dipanggil setelah kamera siap) ---
    async function initializeOnnxModel() {
        if (onnxSession) {
            console.log("ONNX model already loaded.");
            modelReady = true; // Pastikan status benar jika sudah dimuat
            return Promise.resolve(true);
        }
        console.log("Initializing ONNX Model...");
        if (wordDisplayElement) wordDisplayElement.textContent = "Memuat Model AI...";
        updateProgress(50, "Memuat Model AI...");

        return new Promise(async (resolve, reject) => {
            try {
                onnxSession = await ort.InferenceSession.create(ONNX_MODEL_PATH, {
                    executionProviders: ['wasm'], graphOptimizationLevel: 'all'
                });
                modelReady = true;
                console.log("Game ONNX model loaded successfully.");
                updateProgress(100, "Model AI Berhasil Dimuat!");
                // Pesan SIAP DIMAINKAN akan diatur setelah semua siap
                setTimeout(() => { // Sembunyikan progress bar setelah selesai
                    if (progressBarContainer) progressBarContainer.style.display = 'none';
                    if (loadingStatusText) loadingStatusText.style.display = 'none';
                }, 1000);
                resolve(true);
            } catch (error) {
                console.error("Failed to load game ONNX model:", error);
                modelReady = false;
                updateProgress(100, "Gagal Memuat Model AI!");
                reject(error); // Penting untuk reject promise jika gagal
            }
        });
    }

    // --- Logika Kamera ---
    async function startCamera() {
        if (!mediaPipeReady) {
            showCustomPopup("MediaPipe Belum Siap", "Komponen pemrosesan tangan belum siap. Mohon tunggu atau segarkan halaman.");
            return;
        }
        if (cameraActive) return;

        if (loadingStatusText) { loadingStatusText.textContent = "Memulai kamera..."; loadingStatusText.style.display = 'block'; }
        if (canvasCtx && canvasElement.width > 0 && canvasElement.height > 0) {
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        }

        try {
            gameStream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: false });
            videoElement.srcObject = gameStream;
            videoElement.style.display = 'none';

            videoElement.onloadedmetadata = async () => {
                videoElement.play();
                console.log("Video metadata loaded. Dimensions:", videoElement.videoWidth, videoElement.videoHeight);
                if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
                    canvasElement.width = videoElement.videoWidth;
                    canvasElement.height = videoElement.videoHeight;
                    canvasElement.style.display = 'block';
                    console.log("Canvas dimensions set to:", canvasElement.width, canvasElement.height);
                    cameraActive = true;

                    if (!modelReady) { // Hanya inisialisasi ONNX jika belum dan kamera sudah siap
                        try {
                            await initializeOnnxModel(); // Tunggu ONNX selesai
                            if (modelReady) {
                                // UI updates setelah ONNX juga siap
                                startGameBtn.style.display = 'none';
                                stopCameraBtn.style.display = 'inline-block';
                                if (wordDisplayElement) wordDisplayElement.textContent = "SIAP DIMAINKAN!";
                                if (loadingStatusText) loadingStatusText.style.display = 'none';
                                startGameLogic();
                                sendToMediaPipeLoop();
                            } else {
                                showCustomPopup("Kesalahan Model AI", "Gagal memuat model AI setelah kamera dimulai. Permainan tidak dapat dimulai.");
                                stopCamera(); // Hentikan kamera jika ONNX gagal
                            }
                        } catch (onnxError) {
                            showCustomPopup("Kesalahan Model AI", `Gagal memuat model AI: ${onnxError.message}. Permainan tidak dapat dimulai.`);
                            stopCamera();
                        }
                    } else { // Model ONNX sudah siap dari sebelumnya
                        startGameBtn.style.display = 'none';
                        stopCameraBtn.style.display = 'inline-block';
                        if (wordDisplayElement) wordDisplayElement.textContent = "SIAP DIMAINKAN!";
                        if (loadingStatusText) loadingStatusText.style.display = 'none';
                        startGameLogic();
                        sendToMediaPipeLoop();
                    }
                } else {
                    console.error("Video dimensions are invalid after metadata load.");
                    showCustomPopup("Kesalahan Video", "Dimensi video tidak valid.");
                    stopCamera();
                }
            };
        } catch (err) {
            console.error("Error accessing camera:", err);
            if (loadingStatusText) loadingStatusText.style.display = 'none';
            showCustomPopup("Kesalahan Kamera", "Tidak bisa mengakses kamera. Pastikan izin diberikan.");
            cameraActive = false;
        }
    }

    function stopCamera() {
        if (gameStream) { gameStream.getTracks().forEach(track => track.stop()); gameStream = null; }
        if (videoElement) videoElement.srcObject = null;
        cameraActive = false;
        if (animationFrameId_game) { cancelAnimationFrame(animationFrameId_game); animationFrameId_game = null; }

        if (startGameBtn) startGameBtn.style.display = 'inline-block';
        if (stopCameraBtn) stopCameraBtn.style.display = 'none';
        if (nextWordBtn) nextWordBtn.style.display = 'none';
        if (detectedCharDisplayElement) detectedCharDisplayElement.textContent = "";
        if (wordDisplayElement) wordDisplayElement.textContent = "Kamera Dihentikan. Klik 'Mulai Permainan'.";
        if (canvasCtx && canvasElement && canvasElement.width > 0 && canvasElement.height > 0) {
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        }
        console.log("Camera stopped.");
    }

    // --- Loop Pengiriman Frame ke MediaPipe ---
    async function sendToMediaPipeLoop() {
        if (!cameraActive || !hands) return; // Pastikan hands juga ada
        if (videoElement.readyState >= videoElement.HAVE_ENOUGH_DATA && videoElement.videoWidth > 0) {
            try {
                await hands.send({ image: videoElement });
            } catch (e) {
                console.error("ERROR IN hands.send(): ", e);
                stopCamera(); // Hentikan jika ada error fatal dari MediaPipe
                showCustomPopup("Kesalahan MediaPipe", "Terjadi error saat memproses frame video. Kamera dihentikan.");
                return;
            }
        }
        if (cameraActive) animationFrameId_game = requestAnimationFrame(sendToMediaPipeLoop);
    }

    // --- Logika Permainan ---
    function pickNewWord() {
        const randomIndex = Math.floor(Math.random() * wordList.length);
        currentWord = wordList[randomIndex].toUpperCase();
        currentLetterIndex = 0;
        updateWordDisplay();
        if (detectedCharDisplayElement) detectedCharDisplayElement.textContent = "Eja huruf yang ditandai!";
        charBuffer = '';
        predictionCounter = 0;
    }

    function updateWordDisplay() {
        if (!wordDisplayElement || !currentWord) return;
        let displayHTML = "";
        for (let i = 0; i < currentWord.length; i++) {
            if (i < currentLetterIndex) {
                displayHTML += `<span class="spelled-letter">${currentWord[i]}</span>`;
            } else if (i === currentLetterIndex) {
                displayHTML += `<span class="current-letter">> ${currentWord[i]} <</span>`;
            } else {
                displayHTML += `<span class="pending-letter">${currentWord[i]}</span>`;
            }
        }
        wordDisplayElement.innerHTML = displayHTML;
    }

    function startGameLogic() {
        score = 0;
        wordsCompleted = 0;
        updateScoreDisplay();
        pickNewWord();
        if (startGameBtn) startGameBtn.style.display = 'none';
        if (nextWordBtn) nextWordBtn.style.display = 'inline-block';
        if (stopCameraBtn) stopCameraBtn.style.display = 'inline-block';
        console.log("Game logic started/reset.");
    }

    function updateScoreDisplay() {
        if (scoreElement) scoreElement.textContent = score;
        if (wordsCompletedElement) wordsCompletedElement.textContent = wordsCompleted;
    }

    // --- Pemrosesan Hasil MediaPipe & Inferensi ONNX ---
    async function onHandResults(results) {
        if (!canvasCtx || !(canvasElement.width > 0 && canvasElement.height > 0)) return;
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        if (results.image && results.image.width > 0 && results.image.height > 0) {
            canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
        } else {
            canvasCtx.fillStyle = '#eee';
            canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
            canvasCtx.fillStyle = '#333';
            canvasCtx.font = '16px Nunito';
            canvasCtx.textAlign = 'center';
            canvasCtx.fillText('Menunggu frame kamera...', canvasElement.width / 2, canvasElement.height / 2);
        }

        // Hanya lakukan inferensi jika model ONNX sudah siap, tangan terdeteksi, dan game berjalan
        if (modelReady && onnxSession && results.multiHandLandmarks && results.multiHandLandmarks.length > 0 && currentWord && currentLetterIndex < currentWord.length) {
            const landmarks = results.multiHandLandmarks[0];
            if (typeof drawConnectors === 'function' && typeof HAND_CONNECTIONS !== 'undefined') {
                drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
            }
            if (typeof drawLandmarks === 'function') {
                drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 1 });
            }

            const extractedLandmarks = extractAndNormalizeLandmarks(landmarks);

            if (extractedLandmarks.length === NUM_FEATURES) {
                try {
                    const inputTensor = new ort.Tensor('float32', Float32Array.from(extractedLandmarks), [1, NUM_FEATURES]);
                    const feeds = { [ONNX_MODEL_INPUT_NAME]: inputTensor };
                    const outputMap = await onnxSession.run(feeds);

                    if (outputMap[ONNX_MODEL_OUTPUT_NAME] && outputMap[ONNX_MODEL_OUTPUT_NAME].data) {
                        const predictedLabelRaw = outputMap[ONNX_MODEL_OUTPUT_NAME].data[0];
                        const predictedLetter = predictedLabelRaw.toUpperCase();

                        if (detectedCharDisplayElement) detectedCharDisplayElement.textContent = `Terdeteksi: ${predictedLetter}`;

                        if (!['1', '2', '3', '4'].includes(predictedLabelRaw)) {
                            if (predictedLetter === charBuffer) {
                                predictionCounter++;
                            } else {
                                charBuffer = predictedLetter;
                                predictionCounter = 0;
                            }

                            if (predictionCounter >= PREDICTION_THRESHOLD_GAME) {
                                const targetLetter = currentWord[currentLetterIndex];
                                if (predictedLetter === targetLetter) {
                                    currentLetterIndex++;
                                    score += 10;
                                    updateScoreDisplay();
                                    updateWordDisplay();
                                    charBuffer = '';
                                    predictionCounter = 0;

                                    if (currentLetterIndex >= currentWord.length) {
                                        wordsCompleted++;
                                        updateScoreDisplay();
                                        if (detectedCharDisplayElement) detectedCharDisplayElement.textContent = "KEREN!";
                                        showCustomPopup("Selamat!", `Kata "${currentWord}" berhasil dieja! Klik "Kata Berikutnya".`);
                                        if (nextWordBtn) nextWordBtn.focus();
                                    }
                                } else {
                                    if (detectedCharDisplayElement) detectedCharDisplayElement.textContent = `Terdeteksi: ${predictedLetter} (Coba lagi untuk ${targetLetter})`;
                                }
                            }
                        } else {
                            if (detectedCharDisplayElement) detectedCharDisplayElement.textContent = `Terdeteksi: Isyarat Khusus`;
                            charBuffer = ''; predictionCounter = 0;
                        }
                    }
                } catch (error) {
                    console.error("Error during ONNX inference in game:", error);
                    if (detectedCharDisplayElement) detectedCharDisplayElement.textContent = "Error Proses AI";
                }
            }
        } else if (cameraActive && modelReady && onnxSession) { // Jika kamera aktif & model siap tapi tidak ada tangan
            if (detectedCharDisplayElement && currentWord && currentLetterIndex >= currentWord.length) {
                // Kata sudah selesai
            } else if (detectedCharDisplayElement) {
                detectedCharDisplayElement.textContent = "Arahkan tangan ke kamera";
            }
            charBuffer = ''; predictionCounter = 0;
        } else if (cameraActive && !modelReady && detectedCharDisplayElement) { // Jika kamera aktif tapi model AI belum siap
             detectedCharDisplayElement.textContent = "Menunggu model AI selesai dimuat...";
        }
        canvasCtx.restore();
    }

    // --- Fungsi Helper Normalisasi Landmark ---
    function extractAndNormalizeLandmarks(handLandmarks) {
        const landmarksArray = [];
        if (!handLandmarks || handLandmarks.length === 0) { return landmarksArray; }
        const rawXCoordinates = []; const rawYCoordinates = [];
        for (const landmark of handLandmarks) {
            rawXCoordinates.push(landmark.x); rawYCoordinates.push(landmark.y);
        }
        const minX = Math.min(...rawXCoordinates); const minY = Math.min(...rawYCoordinates);
        for (const landmark of handLandmarks) {
            landmarksArray.push(landmark.x - minX); landmarksArray.push(landmark.y - minY);
        }
        return landmarksArray.slice(0, NUM_FEATURES);
    }

    // --- Event Listeners Tombol ---
    if (startGameBtn) {
        startGameBtn.addEventListener('click', startCamera);
    }
    if (stopCameraBtn) {
        stopCameraBtn.addEventListener('click', stopCamera);
    }
    if (nextWordBtn) {
        nextWordBtn.addEventListener('click', () => {
            if (!currentWord || currentLetterIndex >= currentWord.length) {
                pickNewWord();
                // updateWordDisplay(); // pickNewWord sudah memanggil updateWordDisplay
            } else {
                showCustomPopup("Selesaikan Dulu!", "Selesaikan mengeja kata saat ini sebelum lanjut ke kata berikutnya.");
            }
        });
    }

    // --- ALUR INISIALISASI UTAMA ---
    async function main() {
        if (startGameBtn) startGameBtn.disabled = true;
        if (wordDisplayElement) wordDisplayElement.textContent = "Menyiapkan MediaPipe...";

        try {
            await initializeMediaPipe();
            console.log("MediaPipe initialization sequence complete.");
            if (wordDisplayElement) wordDisplayElement.textContent = "MediaPipe Siap. Klik 'Mulai Permainan'.";
            if (startGameBtn) {
                startGameBtn.disabled = false;
                startGameBtn.innerHTML = '<i class="fas fa-play"></i> Mulai Permainan';
            }
        } catch (error) {
            console.error("Gagal pada tahap inisialisasi MediaPipe:", error);
            if (wordDisplayElement) wordDisplayElement.textContent = "GAGAL INISIALISASI MEDIAPIPE.";
            showCustomPopup("Kesalahan Kritis", "Gagal menginisialisasi MediaPipe. Coba muat ulang halaman.");
            if (startGameBtn) startGameBtn.disabled = true;
        }
    }

    main();
});