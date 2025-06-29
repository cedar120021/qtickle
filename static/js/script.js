// script.js

// Initialize Stripe with your publishable key.
// Replace 'pk_test_YOUR_PUBLISHABLE_KEY' with your actual Stripe publishable key.
// You can find this in your Stripe Dashboard (Developers -> API keys).
// For development, use a test publishable key (starts with pk_test_).
const stripe = Stripe('pk_test_51ReT76CL22MlIYKBye392gwdQCuipAEusNp5wdJUUke0u6UyrorPKRTwDAZs6rsoNXgnHgStXuGjTUKO5xuVk7c6000Noc83Jt');


document.addEventListener('DOMContentLoaded', () => {
    // --- General DOM Elements ---
    const body = document.body; // Reference to the body element for overflow control

    // --- Mobile Navigation Toggle ---
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileNav = document.getElementById('mobile-nav');

    if (mobileMenuButton && mobileNav) {
        mobileMenuButton.addEventListener('click', () => {
            mobileNav.classList.toggle('hidden');
            mobileNav.classList.toggle('open');
            body.classList.toggle('overflow-hidden'); // Toggle body scroll for mobile nav
        });

        const mobileNavLinks = mobileNav.querySelectorAll('a');
        mobileNavLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileNav.classList.add('hidden');
                mobileNav.classList.remove('open');
                body.classList.remove('overflow-hidden'); // Restore body scroll
            });
        });
    } else {
        console.warn('Mobile menu button or navigation not found.');
    }

    // --- Smooth Scrolling for Anchor Links ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();

            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // --- Cart Functionality ---
    const cartCountSpan = document.getElementById('cart-count');
    const addToCartButtons = document.querySelectorAll('.add-to-cart');
    const cartNotification = document.getElementById('cart-notification'); // This is a general notification, not cart modal
    const cartModal = document.getElementById('cartModal');
    const closeCartModalButton = document.getElementById('closeCartModal');
    const cartButton = document.getElementById('cart-button'); // The cart icon button
    const cartItemsContainer = document.getElementById('cart-items');

    // New shipping and total display elements - RE-ADDED
    const shippingZipCodeInput = document.getElementById('shipping-zip-code');
    const shippingCountrySelect = document.getElementById('shipping-country');
    const cartSubtotalSpan = document.getElementById('cart-subtotal');
    const cartShippingEstimateSpan = document.getElementById('cart-shipping-estimate');
    const cartGrandTotalSpan = document.getElementById('cart-grand-total');

    const checkoutButton = document.getElementById('checkoutButton'); // Get checkout button

    let cart = JSON.parse(localStorage.getItem('shoppingCart')) || []; // Load cart from localStorage or initialize empty array

    // Function to calculate a client-side *estimated* shipping cost - RE-ADDED
    // This is for display purposes only. Actual shipping will be calculated server-side.
    function getEstimatedShippingCost(countryCode, subtotal) {
        // Implement very basic, client-side shipping logic for display
        if (subtotal === 0) return 0;

        switch (countryCode) {
            case 'US':
                return 5.00; // Flat rate for US
            case 'CA':
                return 10.00; // Flat rate for Canada
            case 'MX':
                return 12.00; // Flat rate for Mexico
            case 'GB':
                return 15.00; // Flat rate for UK
            case 'AU':
                return 18.00; // Flat rate for Australia
            default:
                return 20.00; // Default international shipping
        }
    }


    // Function to update cart count display and all totals - MODIFIED
    function updateCartSummary() {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCountSpan.textContent = totalItems;

        let subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cartSubtotalSpan.textContent = `$${subtotal.toFixed(2)}`;

        // Only calculate shipping if inputs exist (i.e., cart modal is loaded)
        let estimatedShipping = 0;
        if (shippingCountrySelect) {
            const selectedCountry = shippingCountrySelect.value;
            estimatedShipping = getEstimatedShippingCost(selectedCountry, subtotal);
            cartShippingEstimateSpan.textContent = `$${estimatedShipping.toFixed(2)}`;
        }


        const grandTotal = subtotal + estimatedShipping;
        cartGrandTotalSpan.textContent = `$${grandTotal.toFixed(2)}`;

        // Disable checkout if cart is empty
        if (cart.length === 0) {
            checkoutButton.disabled = true;
            checkoutButton.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            checkoutButton.disabled = false;
            checkoutButton.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }

    // Function to save cart to localStorage
    function saveCart() {
        localStorage.setItem('shoppingCart', JSON.stringify(cart));
        updateCartSummary(); // Always update summary after saving
    }

    // Function to render cart items in the modal - MODIFIED
    function renderCart() {
        cartItemsContainer.innerHTML = ''; // Clear previous items

        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<p class="text-gray-500 text-center">Your cart is empty.</p>';
        } else {
            cart.forEach(item => {
                const cartItemDiv = document.createElement('div');
                cartItemDiv.classList.add('cart-item');
                cartItemDiv.innerHTML = `
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-price">$${item.price.toFixed(2)} each</div>
                    </div>
                    <div class="cart-item-quantity-control">
                        <button class="decrease-quantity" data-product-id="${item.id}">-</button>
                        <span class="cart-item-quantity">${item.quantity}</span>
                        <button class="increase-quantity" data-product-id="${item.id}">+</button>
                    </div>
                    <button class="remove-item-button" data-product-id="${item.id}">Remove</button>
                `;
                cartItemsContainer.appendChild(cartItemDiv);
            });
        }
        updateCartSummary(); // Update totals after rendering cart items

        // Add event listeners for quantity controls and remove buttons after rendering
        document.querySelectorAll('.decrease-quantity').forEach(button => {
            button.addEventListener('click', (event) => {
                const productId = event.target.dataset.productId;
                updateQuantity(productId, -1);
            });
        });

        document.querySelectorAll('.increase-quantity').forEach(button => {
            button.addEventListener('click', (event) => {
                const productId = event.target.dataset.productId;
                updateQuantity(productId, 1);
            });
        });

        document.querySelectorAll('.remove-item-button').forEach(button => {
            button.addEventListener('click', (event) => {
                const productId = event.target.dataset.productId;
                removeItem(productId);
            });
        });
    }

    // Function to add/update item in cart
    function addItemToCart(id, name, price, image) { // Added image parameter
        const existingItemIndex = cart.findIndex(item => item.id === id);

        if (existingItemIndex > -1) {
            cart[existingItemIndex].quantity++;
        } else {
            cart.push({ id, name, price, image, quantity: 1 }); // Store image
        }
        saveCart();
        showNotification(`${name} added to cart!`);
    }

    // Function to update item quantity
    function updateQuantity(id, change) {
        const itemIndex = cart.findIndex(item => item.id === id);
        if (itemIndex > -1) {
            cart[itemIndex].quantity += change;
            if (cart[itemIndex].quantity <= 0) {
                cart.splice(itemIndex, 1); // Remove if quantity drops to 0 or less
            }
            saveCart();
            renderCart(); // Re-render cart after quantity change
        }
    }

    // Function to remove item from cart
    function removeItem(id) {
        cart = cart.filter(item => item.id !== id);
        saveCart();
        renderCart(); // Re-render cart after removal
    }

    // Function to show notification (used for simple, temporary messages)
    function showNotification(message) {
        if (cartNotification) {
            // Updated to use specific spans within the notification
            document.getElementById('cart-notification-icon').textContent = '🛒'; // Cart icon
            document.getElementById('cart-notification-message').textContent = message;
            cartNotification.classList.add('show');
            setTimeout(() => {
                cartNotification.classList.remove('show');
            }, 2000);
        } else {
            console.warn("Cart notification element not found.");
        }
    }

    // Event listener for Add to Cart buttons on product cards
    addToCartButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            const clickedButton = event.currentTarget;
            const productId = clickedButton.dataset.productId;
            const productName = clickedButton.dataset.productName;
            const price = parseFloat(clickedButton.dataset.price);
            const productImage = clickedButton.dataset.productImage || 'https://placehold.co/300x250/cccccc/333333?text=Product'; // Get image or use placeholder

            addItemToCart(productId, productName, price, productImage); // Pass image to addItemToCart
        });
    });

    // Event listeners for Cart Modal
    if (cartButton && cartModal) {
        cartButton.addEventListener('click', () => {
            renderCart(); // Render cart items every time modal is opened
            cartModal.style.display = 'flex';
            body.classList.add('overflow-hidden'); // Prevent body scroll
        });
    }

    if (closeCartModalButton && cartModal) {
        closeCartModalButton.addEventListener('click', () => {
            cartModal.style.display = 'none';
            body.classList.remove('overflow-hidden'); // Restore body scroll
        });
    }

    if (cartModal) {
        window.addEventListener('click', (event) => {
            if (event.target === cartModal) {
                cartModal.style.display = 'none';
                body.classList.remove('overflow-hidden');
            }
        });
    }

    // Event listeners for shipping inputs to update totals - RE-ADDED
    if (shippingZipCodeInput) {
        shippingZipCodeInput.addEventListener('input', updateCartSummary);
    }
    if (shippingCountrySelect) {
        shippingCountrySelect.addEventListener('change', updateCartSummary);
    }


    // --- Image Modal Window Actions ---
    const imageModal = document.getElementById("imageModal");
    const modalImage = document.getElementById("modalImage");
    const modalCaption = document.getElementById("modalCaption");
    const imageModalCloseButton = document.querySelector("#imageModal .close-button");
    const prevButton = document.getElementById("prevButton");
    const nextButton = document.getElementById("nextButton");

    const galleryImages = document.querySelectorAll(".gallery-image");
    let currentImageIndex = 0;

    function updateModalContent() {
        const image = galleryImages[currentImageIndex];
        if (image) {
            modalImage.src = image.dataset.largeSrc;
            modalCaption.textContent = image.dataset.caption;

            if (prevButton) prevButton.style.display = (currentImageIndex === 0) ? "none" : "block";
            if (nextButton) nextButton.style.display = (currentImageIndex === galleryImages.length - 1) ? "none" : "block";
        }
    }

    galleryImages.forEach((image, index) => {
        image.addEventListener("click", function() {
            currentImageIndex = index;
            updateModalContent();
            imageModal.style.display = "flex";
            body.classList.add('overflow-hidden'); // Prevent body scroll
        });
    });

    if (prevButton) {
        prevButton.addEventListener("click", function(event) {
            event.stopPropagation();
            if (currentImageIndex > 0) {
                currentImageIndex--;
                updateModalContent();
            }
        });
    }

    if (nextButton) {
        nextButton.addEventListener("click", function(event) {
            event.stopPropagation();
            if (currentImageIndex < galleryImages.length - 1) {
                currentImageIndex++;
                updateModalContent();
            }
        });
    }

    if (imageModalCloseButton) {
        imageModalCloseButton.addEventListener("click", function() {
            imageModal.style.display = "none";
            body.classList.remove('overflow-hidden'); // Restore body scroll
        });
    }

    window.addEventListener("click", function(event) {
        if (event.target === imageModal) {
            imageModal.style.display = "none";
            body.classList.remove('overflow-hidden');
        }
    });

    // --- Contact Form Submission & Notification ---
    const contactForm = document.querySelector('#contact form'); // Select the form within the contact section
    const messageNotificationModal = document.getElementById('messageNotificationModal');
    const messageNotificationContent = document.getElementById('messageNotificationContent');
    const closeMessageNotificationButton = document.getElementById('closeMessageNotification');

    // Directly select these elements as they are now expected to be in HTML
    const messageModalIcon = document.getElementById('message-modal-icon');
    const messageModalTitle = document.getElementById('message-modal-title');
    const messageModalBody = document.getElementById('message-modal-body');
    const messageModalOkButton = document.getElementById('message-modal-ok-button');

    function showMessageModal(title, message, type) {
        // Basic check to ensure all critical elements for the message modal exist
        if (!messageNotificationModal || !messageModalIcon || !messageModalTitle || !messageModalBody || !messageModalOkButton) {
            console.error("Message modal elements not found in HTML. Please ensure 'message-modal-icon', 'message-modal-title', 'message-modal-body', and 'message-modal-ok-button' exist within '#messageNotificationContent'.");
            return; // Exit if elements are missing
        }
        messageModalTitle.textContent = title;
        messageModalBody.textContent = message;

        // Set icon based on type
        if (type === 'success') {
            messageModalIcon.innerHTML = '🎉'; // Party popper emoji
            messageModalIcon.style.color = '#10B981'; // Green
        } else if (type === 'error') {
            messageModalIcon.innerHTML = '❌'; // Red X emoji
            messageModalIcon.style.color = '#EF4444'; // Red
        } else { // Neutral or info
            messageModalIcon.innerHTML = '💡'; // Lightbulb emoji
            messageModalIcon.style.color = '#3B82F6'; // Blue
        }

        messageNotificationModal.classList.remove('hidden'); // Show the modal
        messageNotificationModal.classList.add('flex'); // Ensure it's displayed with flex for centering
        body.classList.add('overflow-hidden'); // Prevent body scroll
    }

    function closeMessageModal() {
        if (!messageNotificationModal) return; // Prevent errors if modal not found

        messageNotificationModal.classList.add('hidden'); // Hide the modal
        messageNotificationModal.classList.remove('flex'); // Remove flex display
        body.classList.remove('overflow-hidden'); // Restore body scroll
        // Clear query parameters after closing the modal to prevent it from reappearing on refresh
        const url = new URL(window.location.href);
        url.searchParams.delete('payment');
        url.searchParams.delete('session_id'); // Also clear session_id
        window.history.replaceState({}, document.title, url.toString());
    }

    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Prevent the default form submission (page reload)

            // Get form data
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const message = document.getElementById('message').value;

            // Function to validate email format
            const isValidEmail = (email) => {
                // A more robust regex for email validation
                const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
                return emailRegex.test(email);
            };

            if (!isValidEmail(email)) {
                showMessageModal('Invalid Email', 'Please enter a valid email address.', 'error');
                return;
            }

            // Simulate a successful submission for now
            showMessageModal('Message Sent Successfully!', 'Thank you for your message. We will get back to you soon.', 'success');
            contactForm.reset(); // Clear the form fields
        });
    }

    if (closeMessageNotificationButton) {
        closeMessageNotificationButton.addEventListener('click', closeMessageModal);
    }
    // Also attach to the OK button for message modal
    if (messageModalOkButton) {
        messageModalOkButton.addEventListener('click', closeMessageModal);
    }


    // --- Stripe Checkout Integration ---
    let BACKEND_ORIGIN;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        BACKEND_ORIGIN = 'http://127.0.0.1:5000'; // Flask local server is on port 5000
    } else {
        BACKEND_ORIGIN = 'https://qtickle.vercel.app'; // Your deployed Vercel backend URL
    }

    const CHECKOUT_SESSION_ENDPOINT = '/create-checkout-session'; // Your endpoint path
    const CHECKOUT_SESSION_URL = `${BACKEND_ORIGIN}${CHECKOUT_SESSION_ENDPOINT}`;

    // Define SUCCESS_URL and CANCEL_URL.
    // These are passed to your backend, and your backend will ultimately redirect to them.
    // Ensure these match your backend's expected URLs.
    const SUCCESS_URL = `${BACKEND_ORIGIN}/stripe-success-handler`; // Backend handles redirect to frontend
    const CANCEL_URL = `${BACKEND_ORIGIN}/index.html?payment=cancelled`; // Backend might redirect directly or via /cancel-handler

    if (checkoutButton) {
        checkoutButton.addEventListener('click', async () => {
            if (cart.length === 0) {
                showMessageModal('Your cart is empty', 'Add items before checking out.', 'neutral');
                return;
            }

            // Get shipping details - RE-ADDED
            const shippingZipCode = shippingZipCodeInput.value.trim();
            const shippingCountry = shippingCountrySelect.value;

            if (!shippingZipCode || shippingZipCode.length < 3) { // Basic validation
                showMessageModal('Shipping Address Required', 'Please enter a valid zip code.', 'error');
                return;
            }

            // Close the cart modal before initiating checkout
            cartModal.style.display = 'none';
            body.classList.remove('overflow-hidden');

            // Transform cart items into Stripe-friendly line_items
            const lineItems = cart.map(item => ({
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: item.name,
                        images: [item.image],
                    },
                    unit_amount: Math.round(item.price * 100), // Price in cents
                },
                quantity: item.quantity,
            }));

            try {
                // Show a loading message while waiting for the backend
                showMessageModal('Processing Order', 'Please wait while we prepare your checkout...', 'neutral');


                const response = await fetch(CHECKOUT_SESSION_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        lineItems,
                        shippingAddress: { // Send shipping address details to backend - RE-ADDED
                            zip_code: shippingZipCode,
                            country: shippingCountry
                        },
                        success_url: SUCCESS_URL,
                        cancel_url: CANCEL_URL,
                    }),
                });

                const session = await response.json();
                closeMessageModal(); // Close loading message


                if (response.ok) {
                    // Redirect to Stripe Checkout
                    const result = await stripe.redirectToCheckout({
                        sessionId: session.id, // Changed from sessionId to id to match backend
                    });

                    if (result.error) {
                        console.error('Stripe redirect error:', result.error.message);
                        showMessageModal('Checkout Error', `Stripe redirect error: ${result.error.message}`, 'error');
                    }
                } else {
                    console.error('Error creating checkout session:', session.error);
                    showMessageModal('Checkout Error', `Error: ${session.error}`, 'error');
                }
            } catch (error) {
                console.error('Network or other error during checkout:', error);
                closeMessageModal(); // Close loading message even on network error
                showMessageModal('Network Error', 'An error occurred during checkout. Please try again. Ensure your backend is running and accessible.', 'error');
            }
        });
    }


    // Initialize cart count on page load
    updateCartSummary(); // Changed to updateCartSummary to get full totals on load

    // --- Global Keyboard Event Listener (for Esc key) ---
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            if (imageModal && imageModal.style.display === 'flex') {
                imageModal.style.display = 'none';
                body.classList.remove('overflow-hidden');
            } else if (cartModal && cartModal.style.display === 'flex') {
                cartModal.style.display = 'none';
                body.classList.remove('overflow-hidden');
            } else if (messageNotificationModal && messageNotificationModal.classList.contains('flex')) {
                closeMessageModal();
            }
        } else if (imageModal && imageModal.style.display === "flex") {
            if (event.key === 'ArrowLeft') {
                if (prevButton) prevButton.click();
            } else if (event.key === 'ArrowRight') {
                if (nextButton) nextButton.click();
            }
        }
    });

    // --- Handle URL parameters for payment status on page load ---
    // This block runs every time the page loads, checking for payment status
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');

    if (paymentStatus === 'success') {
        showMessageModal('Payment Successful!', 'Thank you for your purchase. Your order has been placed.', 'success');
        localStorage.removeItem('shoppingCart'); // Clear cart after successful payment
        cart = []; // Update local cart array
        updateCartSummary(); // Refresh cart count and totals to show 0 items
    } else if (paymentStatus === 'cancelled') {
        showMessageModal('Payment Cancelled', 'Your payment was cancelled. You can continue shopping.', 'error');
    }

    // --- Initial load: Update cart display ---
    renderCart(); // Call renderCart to populate cart on initial load
    updateCartSummary(); // Ensure count and all totals are updated on initial load

});
