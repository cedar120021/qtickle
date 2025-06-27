// script.js

document.addEventListener('DOMContentLoaded', () => {
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileNav = document.getElementById('mobile-nav');

    if (mobileMenuButton && mobileNav) {
        mobileMenuButton.addEventListener('click', () => {
            // Toggle the 'hidden' class for a simpler show/hide,
            // or toggle 'open' for a CSS transition effect (as set up in style.css).
            mobileNav.classList.toggle('hidden');
            mobileNav.classList.toggle('open'); // For CSS transition
        });

        // Close mobile menu when a navigation link is clicked
        const mobileNavLinks = mobileNav.querySelectorAll('a');
        mobileNavLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileNav.classList.add('hidden');
                mobileNav.classList.remove('open');
            });
        });
    }

    // Smooth scrolling for anchor links (optional, but good for UX)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();

            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });
});


//Image Modal Window Actions
// Get the modal and its components
        const modal = document.getElementById("imageModal");
        const modalImage = document.getElementById("modalImage");
        const modalCaption = document.getElementById("modalCaption");
        const closeButton = document.querySelector(".close-button");
        const prevButton = document.getElementById("prevButton");
        const nextButton = document.getElementById("nextButton");

        // Get all gallery images (NodeList)
        const galleryImages = document.querySelectorAll(".gallery-image");

        // Variable to keep track of the currently displayed image's index
        let currentImageIndex = 0;

        // Function to update the modal content based on the current image index
        function updateModalContent() {
            const image = galleryImages[currentImageIndex];
            if (image) {
                modalImage.src = image.dataset.largeSrc;
                modalCaption.textContent = image.dataset.caption;

                // Hide/show arrows at ends
                prevButton.style.display = (currentImageIndex === 0) ? "none" : "block";
                nextButton.style.display = (currentImageIndex === galleryImages.length - 1) ? "none" : "block";
            }
        }

        // When a gallery image is clicked, open the modal and set the initial image
        galleryImages.forEach((image, index) => {
            image.addEventListener("click", function() {
                currentImageIndex = index; // Set the index of the clicked image
                updateModalContent();       // Load its content
                modal.style.display = "flex"; // Show the modal
            });
        });

        // Click handler for Previous button
        prevButton.addEventListener("click", function(event) {
            event.stopPropagation(); // Prevent modal from closing if clicked on background
            if (currentImageIndex > 0) {
                currentImageIndex--;
                updateModalContent();
            }
        });

        // Click handler for Next button
        nextButton.addEventListener("click", function(event) {
            event.stopPropagation(); // Prevent modal from closing if clicked on background
            if (currentImageIndex < galleryImages.length - 1) {
                currentImageIndex++;
                updateModalContent();
            }
        });

        // When the user clicks on the close button, hide the modal
        closeButton.addEventListener("click", function() {
            modal.style.display = "none";
        });

        // When the user clicks anywhere outside of the modal content (but not on arrows), hide the modal
        window.addEventListener("click", function(event) {
            if (event.target === modal) {
                modal.style.display = "none";
            }
        });

        // Close modal with Escape key
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') {
                modal.style.display = 'none';
            } else if (modal.style.display === "flex") { // Only navigate if modal is open
                if (event.key === 'ArrowLeft') {
                    // Simulate a click on the previous button
                    prevButton.click();
                } else if (event.key === 'ArrowRight') {
                    // Simulate a click on the next button
                    nextButton.click();
                }
            }
        });