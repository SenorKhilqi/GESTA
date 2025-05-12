// JavaScript for the translate-to-gesture.html page
document.addEventListener('DOMContentLoaded', function() {
    // Get elements
    const textInput = document.getElementById('text-input');
    const convertBtn = document.getElementById('convert-btn');
    const gestureContainer = document.getElementById('gesture-container');
    const gestureCards = document.getElementById('gesture-cards');
    const loadingIndicator = document.getElementById('loading-indicator');
    
    // Only execute if we're on the text-to-gesture page
    if(textInput && convertBtn && gestureCards) {
        // Initialize alphabet display if needed
        if(document.getElementById('alphabet-container')) {
            initializeAlphabet();
        }
        
        // Text to gesture conversion
        convertBtn.addEventListener('click', function() {
            convertTextToGestures();
        });
        
        // Allow pressing Enter key to convert
        textInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                convertTextToGestures();
            }
        });
    }      // Function to convert text to gesture images
    function convertTextToGestures() {
        const text = textInput.value.trim();
        if (!text) {
            alert('Please enter some text to convert.');
            return;
        }
        
        // Show loading indicator
        if(loadingIndicator) loadingIndicator.style.display = 'flex';
        gestureContainer.style.display = 'none';
        gestureCards.style.display = 'none';
        
        // Clear previous results
        gestureCards.innerHTML = '';
        
        setTimeout(() => {
            // Hide loading indicator
            if(loadingIndicator) loadingIndicator.style.display = 'none';
            gestureCards.style.display = 'block'; // Changed to block for better layout
            
            // Create a container for the word
            const wordContainer = document.createElement('div');
            wordContainer.className = 'word-container';
            
            // Add a title for the original text
            const titleDiv = document.createElement('div');
            titleDiv.className = 'gesture-title';
            titleDiv.innerHTML = `<h3>Terjemahan: "${text}"</h3>`;
            gestureCards.appendChild(titleDiv);
            
            // Create a container for all gesture cards
            const cardsWrapper = document.createElement('div');
            cardsWrapper.className = 'gesture-cards-wrapper';
            gestureCards.appendChild(cardsWrapper);
            
            // Process each character of the input text
            const characters = text.split('');
            const cardElements = new Array(characters.length);
            
            characters.forEach((char, index) => {
                // Create a card for each character
                const charCard = document.createElement('div');
                charCard.className = 'gesture-card';
                charCard.dataset.index = index; // Store the original position
                
                // Skip spaces but add a visual separator
                if (char === ' ') {
                    charCard.innerHTML = `
                        <div class="gesture-card-inner space-card">
                            <div class="gesture-space">
                                Spasi
                            </div>
                        </div>
                    `;
                    cardElements[index] = charCard; // Store in the correct position
                    return;
                }
                
                // Try to get the letter image (uppercase for filenames)
                const letterToUse = char.toUpperCase();
                const img = new Image();
                const imagePath = `image/${letterToUse}.png`;
                
                // Store the card in our ordered array
                cardElements[index] = charCard;
                
                img.onload = function() {
                    // Image exists, display it
                    charCard.innerHTML = `
                        <div class="gesture-card-inner">
                            <div class="gesture-image">
                                <img src="${imagePath}" alt="${letterToUse} sign" />
                            </div>
                            <div class="gesture-text">
                                <p>${letterToUse}</p>
                                <small class="position-indicator">${index + 1}</small>
                            </div>
                        </div>
                    `;
                    
                    // Check if all images are loaded
                    checkAllLoaded();
                };
                
                img.onerror = function() {
                    // Image doesn't exist
                    charCard.innerHTML = `
                        <div class="gesture-card-inner">
                            <div class="gesture-image">
                                <div class="no-image">Gambar tidak tersedia</div>
                            </div>
                            <div class="gesture-text">
                                <p>${letterToUse}</p>
                                <small class="position-indicator">${index + 1}</small>
                            </div>
                        </div>
                    `;
                    
                    // Check if all images are loaded
                    checkAllLoaded();
                };
                
                img.src = imagePath;
            });
            
            // Function to check if all cards are ready to be appended
            function checkAllLoaded() {
                // Check if we have all cards created
                const allReady = cardElements.every(card => card && card.innerHTML);
                
                if (allReady) {
                    // Append all cards in the correct order
                    cardElements.forEach(card => {
                        cardsWrapper.appendChild(card);
                    });
                }
            }
            
        }, 500); // Short delay for loading animation
    }
    
    // Function to initialize the alphabet display
    function initializeAlphabet() {
        const alphabetContainer = document.getElementById('alphabet-container');
        const selectedLetterDisplay = document.getElementById('selected-letter-display');
        const selectedLetter = document.getElementById('selected-letter');
        const selectedLetterImage = document.getElementById('selected-letter-image');
        
        if (!alphabetContainer) return;
        
        // Create buttons for each letter
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        alphabet.forEach(letter => {
            const button = document.createElement('button');
            button.className = 'alphabet-btn';
            button.textContent = letter;
            
            button.addEventListener('click', () => {
                // Show the selected letter
                selectedLetterDisplay.style.display = 'block';
                selectedLetter.textContent = letter;
                
                // Try to load the image
                const imagePath = `image/${letter}.png`;
                selectedLetterImage.src = imagePath;
                
                // Handle image loading error
                selectedLetterImage.onerror = () => {
                    selectedLetterImage.style.display = 'none';
                    // Create error message if it doesn't exist
                    let errorMsg = document.getElementById('letter-error-message');
                    if (!errorMsg) {
                        errorMsg = document.createElement('p');
                        errorMsg.id = 'letter-error-message';
                        errorMsg.style.color = 'var(--pastel-red)';
                        selectedLetterDisplay.appendChild(errorMsg);
                    }
                    errorMsg.textContent = 'Gambar tidak tersedia';
                };
                
                // Clear any error message if image loads successfully
                selectedLetterImage.onload = () => {
                    selectedLetterImage.style.display = 'block';
                    const errorMsg = document.getElementById('letter-error-message');
                    if (errorMsg) errorMsg.remove();
                };
            });
            
            alphabetContainer.appendChild(button);
        });
    }
});

// Add CSS styles for the no-image message
document.addEventListener('DOMContentLoaded', function() {
    // Create style element
    const style = document.createElement('style');
    style.textContent = `        .no-image {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            height: 150px;
            background-color: #f5f5f5;
            color: var(--pastel-red);
            font-weight: bold;
            border-radius: 8px;
            border: 2px dashed #ccc;
        }
        
        .gesture-title {
            width: 100%;
            margin-bottom: 20px;
            text-align: center;
            color: var(--primary-color);
        }
        
        .gesture-cards-wrapper {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 15px;
            padding: 10px;
        }
        
        .word-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-bottom: 20px;
            width: 100%;
        }
          .gesture-card {
            flex: 0 0 auto;
            max-width: 180px;
            transition: transform 0.2s;
            position: relative;
        }
        
        .gesture-card:hover {
            transform: translateY(-5px);
        }
        
        .gesture-card-inner {
            background-color: white;
            border-radius: 10px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            overflow: hidden;
            height: 100%;
            display: flex;
            flex-direction: column;
        }
        
        .gesture-image {
            position: relative;
            height: 150px;
            background-color: #f9f9f9;
        }
        
        .gesture-image img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }
        
        .gesture-text {
            padding: 10px;
            text-align: center;
            font-weight: bold;
            background-color: #f0f0f0;
            position: relative;
        }
        
        .gesture-text p {
            margin: 0;
            font-size: 1.2rem;
        }
        
        .position-indicator {
            position: absolute;
            top: -12px;
            right: -5px;
            background-color: var(--primary-color);
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        .space-card {
            background-color: #f0f8ff;
            border: 2px dashed var(--pastel-blue);
        }
          .gesture-space {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 80px;
            font-weight: bold;
            color: var(--pastel-blue);
        }
    `;
    document.head.appendChild(style);
});