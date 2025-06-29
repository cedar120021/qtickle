// script.js

// Initialize Stripe with your publishable key.
// Replace 'YOUR_STRIPE_PUBLISHABLE_KEY' with your actual Stripe publishable key.
// You can find this in your Stripe Dashboard (Developers -> API keys).
// For development, use a test publishable key (starts with pk_test_).
const stripe = Stripe('pk_test_51ReT76CL22MlIYKBye392gwdQCuipAEusNp5wdJUUke0u6UyrorPKRTwDAZs6rsoNXgnHgStXuGjTUKO5xuVk7c6000Noc83Jt');


document.addEventListener('DOMContentLoaded', () => {
    // --- Mobile Navigation Toggle ---
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileNav = document.getElementById('mobile-nav');

    if (mobileMenuButton && mobileNav) {
        mobileMenuButton.addEventListener('click', () => {
            mobileNav.classList.toggle('hidden');
            mobileNav.classList.toggle('open');
        });

        const mobileNavLinks = mobileNav.querySelectorAll('a');
        mobileNavLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileNav.classList.add('hidden');
                mobileNav.classList.remove('open');
            });
        });
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
    const cartNotification = document.getElementById('cart-notification');
    const cartModal = document.getElementById('cartModal');
    const closeCartModalButton = document.getElementById('closeCartModal');
    const cartButton = document.getElementById('cart-button'); // The cart icon button
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalSpan = document.getElementById('cart-total');
    const checkoutButton = document.getElementById('checkoutButton'); // Get checkout button

    let cart = JSON.parse(localStorage.getItem('shoppingCart')) || []; // Load cart from localStorage or initialize empty array

    // Function to update cart count display
    function updateCartCount() {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCountSpan.textContent = totalItems;
    }

    // Function to save cart to localStorage
    function saveCart() {
        localStorage.setItem('shoppingCart', JSON.stringify(cart));
        updateCartCount(); // Always update count after saving
    }

    // Function to render cart items in the modal
    function renderCart() {
        cartItemsContainer.innerHTML = ''; // Clear previous items
        let total = 0;

        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<p class="text-gray-500 text-center">Your cart is empty.</p>';
            checkoutButton.disabled = true; // Disable checkout if cart is empty
        } else {
            checkoutButton.disabled = false; // Enable checkout if cart has items
            cart.forEach(item => {
                const itemTotal = item.price * item.quantity;
                total += itemTotal;

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
        cartTotalSpan.textContent = `$${total.toFixed(2)}`;

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
    function addItemToCart(id, name, price) {
        const existingItemIndex = cart.findIndex(item => item.id === id);

        if (existingItemIndex > -1) {
            cart[existingItemIndex].quantity++;
        } else {
            cart.push({ id, name, price, quantity: 1 });
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

    // Function to show notification (from previous step)
    function showNotification(message) {
        cartNotification.textContent = message;
        cartNotification.classList.add('show');
        setTimeout(() => {
            cartNotification.classList.remove('show');
        }, 2000);
    }

    // Event listener for Add to Cart buttons
    addToCartButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            const clickedButton = event.currentTarget;
            const productId = clickedButton.dataset.productId;
            const productName = clickedButton.dataset.productName;
            const price = parseFloat(clickedButton.dataset.price);
            addItemToCart(productId, productName, price);
        });
    });

    // Event listeners for Cart Modal
    if (cartButton && cartModal) {
        cartButton.addEventListener('click', () => {
            renderCart(); // Render cart items every time modal is opened
            cartModal.style.display = 'flex';
        });
    }

    if (closeCartModalButton && cartModal) {
        closeCartModalButton.addEventListener('click', () => {
            cartModal.style.display = 'none';
        });
    }

    if (cartModal) {
        window.addEventListener('click', (event) => {
            if (event.target === cartModal) {
                cartModal.style.display = 'none';
            }
        });
    }


    // --- Stripe Checkout Integration ---
    if (checkoutButton) {
        checkoutButton.addEventListener('click', async () => {
            if (cart.length === 0) {
                showNotification('Your cart is empty. Add items before checking out.');
                return;
            }

            // Transform cart items into Stripe-friendly line_items
            const lineItems = cart.map(item => ({
                price_data: {
                    currency: 'usd', // IMPORTANT: Set your currency
                    product_data: {
                        name: item.name,
                        // If you have product images, you can add:
                        // images: ['URL_TO_PRODUCT_IMAGE'],
                    },
                    unit_amount: Math.round(item.price * 100), // Price in cents
                },
                quantity: item.quantity,
            }));

            // ** IMPORTANT: This is where you would make a fetch request to your BACKEND. **
            // The backend would then use your Stripe Secret Key to create the Checkout Session.
            // For this client-side demo, we'll simulate a fetch call.
            try {
                // Replace '/create-checkout-session' with your actual backend endpoint
                const response = await fetch('http://127.0.0.1:5000/create-checkout-session', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ lineItems }),
                });

                const session = await response.json();

                if (response.ok) {
                    // Redirect to Stripe Checkout
                    const result = await stripe.redirectToCheckout({
                        sessionId: session.id,
                    });

                    if (result.error) {
                        console.error('Stripe redirect error:', result.error.message);
                        showNotification(`Checkout error: ${result.error.message}`);
                    }
                } else {
                    console.error('Error creating checkout session:', session.error);
                    showNotification(`Error: ${session.error}`);
                }
            } catch (error) {
                console.error('Network or other error during checkout:', error);
                showNotification('An error occurred during checkout. Please try again.');
            }
        });
    }


    // Initialize cart count on page load
    updateCartCount();

    // --- Image Modal Window Actions (existing code) ---
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

            prevButton.style.display = (currentImageIndex === 0) ? "none" : "block";
            nextButton.style.display = (currentImageIndex === galleryImages.length - 1) ? "none" : "block";
        }
    }

    galleryImages.forEach((image, index) => {
        image.addEventListener("click", function() {
            currentImageIndex = index;
            updateModalContent();
            imageModal.style.display = "flex";
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
        });
    }

    window.addEventListener("click", function(event) {
        if (event.target === imageModal) {
            imageModal.style.display = "none";
        }
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            if (imageModal && imageModal.style.display === 'flex') {
                imageModal.style.display = 'none';
            } else if (cartModal && cartModal.style.display === 'flex') {
                cartModal.style.display = 'none';
            }
        } else if (imageModal && imageModal.style.display === "flex") {
            if (event.key === 'ArrowLeft') {
                if (prevButton) prevButton.click();
            } else if (event.key === 'ArrowRight') {
                if (nextButton) nextButton.click();
            }
        }
    });
});


// Function to validate email format
    function isValidEmail(email) {
        // A more robust regex for email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
        return emailRegex.test(email);
    }

// --- Contact Form Submission & Notification ---
    const contactForm = document.querySelector('#contact form'); // Select the form within the contact section
    const messageNotificationModal = document.getElementById('messageNotificationModal');
    const messageNotificationContent = document.getElementById('messageNotificationContent');
    const closeMessageNotificationButton = document.getElementById('closeMessageNotification');

    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Prevent the default form submission (page reload)

            // Get form data
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const message = document.getElementById('message').value;

            // In a real application, you would send this data to your backend
            // Example:
            /*
            try {
                const response = await fetch('/api/contact', { // Replace with your actual backend endpoint
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name, email, message }),
                });

                if (response.ok) {
                    showMessageNotification('Message Sent Successfully!');
                    contactForm.reset(); // Clear the form fields
                } else {
                    const errorData = await response.json();
                    showMessageNotification(`Failed to send message: ${errorData.error || 'Unknown error'}`);
                }
            } catch (error) {
                console.error('Contact form submission error:', error);
                showMessageNotification('An error occurred. Please try again later.');
            }
            */

            // Simulate a successful submission for now
            //showMessageNotification('Message Sent Successfully!');
            showMessageNotification('Submission Error');
            contactForm.reset(); // Clear the form fields

            // Optional: Auto-hide the modal after a few seconds
            setTimeout(() => {
                messageNotificationModal.classList.add('hidden');
            }, 3000); // Hide after 3 seconds
        });
    }

    if (closeMessageNotificationButton) {
        closeMessageNotificationButton.addEventListener('click', () => {
            messageNotificationModal.classList.add('hidden');
        });
    }

    function showMessageNotification(message) {
        messageNotificationContent.textContent = message;
        messageNotificationModal.classList.remove('hidden'); // Show the modal
    }


 // --- Generic Message Modal Logic (for success/cancel, notifications) ---
    // Note: Your HTML uses 'messageNotificationModal' and related IDs for this modal.
    // I am adapting this JS to match your HTML's 'messageNotificationModal' IDs for consistency.
    const messageModal = document.getElementById('messageNotificationModal'); // Matches HTML ID
    const closeMessageModalButton = document.getElementById('closeMessageNotification'); // Matches HTML ID
    const messageModalContent = document.getElementById('messageNotificationContent'); // Matches HTML ID
    // Re-purposing these for icon and title based on your previous request logic
    // You might want to add specific span/div for icon/title in HTML within messageNotificationContent
    const messageModalIconPlaceholder = document.createElement('div');
    messageModalIconPlaceholder.id = 'message-modal-icon';
    messageModalIconPlaceholder.className = 'text-6xl mb-4 mx-auto';
    const messageModalTitlePlaceholder = document.createElement('h3');
    messageModalTitlePlaceholder.id = 'message-modal-title';
    messageModalTitlePlaceholder.className = 'text-2xl font-bold text-gray-800 mb-2';
    const messageModalBodyPlaceholder = document.createElement('p');
    messageModalBodyPlaceholder.id = 'message-modal-body';
    messageModalBodyPlaceholder.className = 'text-gray-700 mb-4';
    const messageModalOkButton = document.createElement('button');
    messageModalOkButton.id = 'message-modal-ok-button';
    messageModalOkButton.className = 'btn-primary px-6 py-3 rounded-full mt-4';
    messageModalOkButton.textContent = 'OK';


    // Prepend these elements to messageModalContent once
    if (messageModalContent && !messageModalContent.querySelector('#message-modal-title')) {
        messageModalContent.prepend(messageModalTitlePlaceholder);
        messageModalContent.prepend(messageModalIconPlaceholder);
        // Append body and OK button outside the direct content div, but within the modal-content wrapper if structure allows
        // For simplicity, let's append them directly to the parent of messageModalContent if it's the correct wrapper
        const modalContentWrapper = messageModal.querySelector('.modal-content'); // Assuming your HTML has this structure
        if (modalContentWrapper) {
            modalContentWrapper.appendChild(messageModalBodyPlaceholder);
            modalContentWrapper.appendChild(messageModalOkButton);
        }
    }


    // Function to update cart total and count display
    const updateCartDisplay = () => {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCountSpan.textContent = totalItems;
        renderCartItems(); // Re-render items whenever cart changes
    };

    const showMessageModal = (title, message, type) => {
        messageModalTitlePlaceholder.textContent = title;
        messageModalBodyPlaceholder.textContent = message;

        // Set icon based on type
        if (type === 'success') {
            messageModalIconPlaceholder.innerHTML = '🎉'; // Party popper emoji
            messageModalIconPlaceholder.style.color = '#10B981'; // Green
        } else if (type === 'error') {
            messageModalIconPlaceholder.innerHTML = '❌'; // Red X emoji
            messageModalIcon.style.color = '#EF4444'; // Red
        } else { // Neutral or info
            messageModalIconPlaceholder.innerHTML = '💡'; // Lightbulb emoji
            messageModalIcon.style.color = '#3B82F6'; // Blue
        }

        messageModal.classList.remove('hidden'); // Show the modal
        messageModal.classList.add('flex'); // Ensure it's displayed with flex for centering
        body.classList.add('overflow-hidden'); // Prevent body scroll
    };

    const closeMessageModal = () => {
        messageModal.classList.add('hidden'); // Hide the modal
        messageModal.classList.remove('flex'); // Remove flex display
        body.classList.remove('overflow-hidden'); // Restore body scroll
        // Clear query parameters after closing the modal to prevent it from reappearing on refresh
        const url = new URL(window.location.href);
        url.searchParams.delete('payment');
        url.searchParams.delete('session_id'); // Also clear session_id
        window.history.replaceState({}, document.title, url.toString());
    };

    // Attach listeners only if elements exist
    if (closeMessageModalButton) closeMessageModalButton.addEventListener('click', closeMessageModal);
    if (messageModalOkButton) messageModalOkButton.addEventListener('click', closeMessageModal);



    // --- Handle URL parameters for payment status on page load ---
    // This block runs every time the page loads, checking for payment status
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');

    if (paymentStatus === 'success') {
        showMessageModal('Payment Successful!', 'Thank you for your purchase. Your order has been placed.', 'success');
        localStorage.removeItem('shoppingCart'); // Clear cart after successful payment
        cart = []; // Update local cart array
        updateCartDisplay(); // Refresh cart display to show 0 items
    } else if (paymentStatus === 'cancelled') {
        showMessageModal('Payment Cancelled', 'Your payment was cancelled. You can continue shopping.', 'error');
    }

    // Function to render cart items in the modal with preferred design
    const renderCartItems = () => {
        cartItemsContainer.innerHTML = ''; // Clear previous items
        let total = 0;

        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<p class="text-gray-500 text-center">Your cart is empty.</p>';
            checkoutButton.disabled = true; // Disable checkout if cart is empty
            checkoutButton.classList.add('opacity-50', 'cursor-not-allowed'); // Add disabled styling
        } else {
            checkoutButton.disabled = false; // Enable checkout if cart has items
            checkoutButton.classList.remove('opacity-50', 'cursor-not-allowed'); // Remove disabled styling

            cart.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.classList.add('cart-item'); // Applying the preferred cart-item class
                itemDiv.innerHTML = `
                    <img src="${item.image}" alt="${item.name}" class="cart-item-image">
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
                cartItemsContainer.appendChild(itemDiv);
                total += item.price * item.quantity;
            });
        }
        cartTotalSpan.textContent = `$${total.toFixed(2)}`;

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
    };


    // --- Initial load: Update cart display ---
    updateCartDisplay();